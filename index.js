const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const mv = require("mv");

const app = express();
const upload = multer({ dest: "uploads/" });
const PORT = 3000;
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/post_uploads", express.static(path.join(__dirname, "post_uploads")));
app.use(cors());

// Create MySQL connection
const db = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "root",
  database: "memoire",
});

app.use(express.json());

///////////////////////////////////////////////////////
app.post(
  "/upload-profile-picture",
  upload.single("profilePicture"),
  (req, res) => {
    const file = req.file;
    const userId = req.body.userId;

    if (!file) {
      return res.status(400).send("No profile picture uploaded");
    }

    const extension = path.extname(file.originalname); // Get the file extension
    const newFilename = `${userId}_${crypto
      .randomBytes(16)
      .toString("hex")}${extension}`; // Generate a unique filename
    const newFilePath = path.join("uploads", newFilename); // Construct the new file path

    // Move the uploaded file to the new file path

    mv(file.path, newFilePath, (err) => {
      if (err) {
        console.error("Error moving file:", err);
        return res.status(500).send("Error uploading profile picture");
      }

      const profilePictureUrl = `/uploads/${newFilename}`; // Construct the URL to be stored in the database

      const query = "UPDATE Users SET profile_picture = ? WHERE userID = ?";
      db.query(query, [profilePictureUrl, userId], (err, result) => {
        if (err) {
          console.error("Error updating profile picture path:", err);
          res.status(500).send("Error uploading profile picture");
        } else {
          res.status(200).send(profilePictureUrl);
          console.log(profilePictureUrl);
        }
      });
    });
  }
);
/////////////////////////////////////////////////////////

app.post("/register", async (req, res) => {
  const { username, name, password } = req.body;

  if (!username || !name || !password) {
    return res.status(400).send("Missing required fields");
  }
  const query = "SELECT * FROM Users WHERE username = ?";
  db.query(query, [username], (error, results, fields) => {
    if (error) {
      console.error(error);
      return res.status(500).json({ error: "Internal server error" });
    }

    if (results.length > 0) {
      return res
        .status(409)
        .json({ message: "Nom d'utilisateur déjà existant" });
    } else {
      const sql = `
      INSERT INTO Users (username, name, password)
      VALUES (?, ?, ?);
      `;
      const values = [username, name, password];

      db.query(sql, values, (err, result) => {
        if (err) {
          console.error(err);
          res.status(500).send("Error during registration");
        } else {
          res.status(200).json({
            message: "Registration successful",
            user: {
              userID: result.insertId,
              username: username,
              name: name,
              password: password,
              profile_picture: null,
              city: null,
            },
          });
          console.log({
            message: "Registration successful",
            user: {
              userID: result.insertId,
              username: username,
              name: name,
              password: password,
              profile_picture: null,
              city: null,
            },
          });
        }
      });
    }
  });
});
/*********************************************************************** */
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: "Missing username or password" });
  }
  db.query(
    "select * from Users WHERE username = ? AND password = ?",
    [username, password],
    (err, result) => {
      if (err) {
        console.log(err);
        res.status(500).json({ message: "internal server error" });
      } else {
        if (result.length > 0) {
          res.status(200).json({ message: "user loged in ", user: result[0] });
          console.log({ message: "succes", User: result[0] });
        } else {
          res
            .status(404)
            .json({ message: "Nom d'utilisateur ou mot de passe incorrect" });
        }
      }
    }
  );
});
/******************************************************************************** */
app.post("/update", async (req, res) => {
  const { id, Name, password, city } = req.body;

  db.query(
    "UPDATE Users SET name = ?, password = ?, city = ? WHERE userID = ?",
    [Name, password, city, id],
    (err, result) => {
      if (err) {
        console.log(err);
        res.status(500).json({ message: "internal server error" });
      } else {
        res.status(200).json({
          message: "Mettre a jour",
          user: {
            userID: id,
            name: Name,
            password: password,
            city: city,
          },
        });
        console.log({
          message: "Mettre a jour",
          user: {
            userID: id,
            name: Name,
            password: password,
            city: city,
          },
        });
      }
    }
  );
});

/******************************************************************* */
const storage = multer.diskStorage({
  destination: "post_uploads/",
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const uploading = multer({ storage });

// POST /api/posts
app.post(
  "/api/posts",
  (req, res, next) => {
    uploading.array("images[]", 10)(req, res, (err) => {
      if (err) {
        if (err.code === "LIMIT_UNEXPECTED_FILE") {
          // No images were provided, continue to the next middleware
          next();
        } else {
          // Handle other errors
          return res.status(500).json({ error: "Error uploading images" });
        }
      } else {
        // Images were provided, continue to the next middleware
        next();
      }
    });
  },
  (req, res) => {
    const { userID, type, service, description, price } = req.body;

    // Insert post data into the "Posts" table
    db.query(
      "INSERT INTO Posts (user_id, type, service, description, price) VALUES (?, ?, ?, ?, ?)",
      [userID, type, service, description, price],
      (err, result) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: "Error creating post" });
        }

        const postId = result.insertId;
        const createdAt = new Date().toISOString(); // Get the current timestamp

        // Fetch the user's name and profile picture
        db.query(
          "SELECT u.name, u.profile_picture FROM Users u WHERE u.userID = ?",
          [userID],
          (err, userResult) => {
            if (err) {
              console.error(err);
              return res
                .status(500)
                .json({ error: "Error fetching user data" });
            }

            const userName = userResult[0].name;
            const userProfilePicture = userResult[0].profile_picture;

            // Insert image data into the "post_images" table
            let imageUrls = [];
            if (req.files) {
              imageUrls = req.files.map(
                (file) => `/post_uploads/${file.filename}`
              );
            }

            // Build the response object
            const response = {
              post_id: postId,
              user_id: userID,
              created_at: createdAt,
              type,
              service,
              description,
              price,
              userName,
              userProfilePicture,
              images: imageUrls,
            };

            // Insert the post images
            const imageInsertions = imageUrls.map((imageUrl) => {
              return new Promise((resolve, reject) => {
                db.query(
                  "INSERT INTO post_images (post_id, image) VALUES (?, ?)",
                  [postId, imageUrl],
                  (err) => {
                    if (err) {
                      console.error(err);
                      reject(err);
                    } else {
                      resolve();
                    }
                  }
                );
              });
            });

            Promise.all(imageInsertions)
              .then(() => {
                console.log("post created");
                return res.status(200).json(response);
              })
              .catch((err) => {
                console.error(err);
                return res.status(500).json({ error: "Error storing images" });
              });
          }
        );
      }
    );
  }
);
/***************************************************************** */
app.get("/posts", (req, res) => {
  const query = `
    SELECT p.*, u.name, u.profile_picture, i.image
    FROM Posts p
    JOIN Users u ON p.user_id = u.userID
    LEFT JOIN post_images i ON p.post_id = i.post_id
    ORDER BY p.created_at DESC
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Internal server error" });
    }

    const posts = results.reduce((acc, row) => {
      const {
        post_id,
        user_id,
        created_at,
        type,
        service,
        description,
        price,
        name,
        profile_picture,
        image,
      } = row;
      const post = acc.find((p) => p.post_id === post_id);

      if (post) {
        post.images.push(image);
      } else {
        acc.push({
          post_id,
          user_id,
          created_at,
          type,
          service,
          description,
          price,
          userName: name,
          userProfilePicture: profile_picture,
          images: [image],
        });
      }

      return acc;
    }, []);

    res.json(posts);
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
