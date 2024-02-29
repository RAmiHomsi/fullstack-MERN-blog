const express = require("express");
const UserModel = require("./models/User");
const PostModel = require("./models/Post");
const app = express();
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const multer = require("multer");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

app.use(express.json());
app.use(cookieParser());

app.use(
  cors({
    origin: [
      "https://rami-fullstack-news.vercel.app/api",
      "http://localhost:3000",
    ],
    methods: ["POST", "GET", "DELETE", "PUT"],
    credentials: true,
  })
);

require("dotenv").config();

// Initialize AWS S3 client
const bucket = "mern-blogg";
const s3Client = new S3Client({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.MY_S3_ACCESS_KEY,
    secretAccessKey: process.env.MY_S3_SECRET_KEY,
  },
});

mongoose
  .connect(process.env.MONGO_URL, { useNewUrlParser: true })
  .then(() => {
    console.log("Connected successfully to db");
    app.listen(3001, () => {
      console.log("Server is running at port 3001");
    });
  })
  .catch((err) => {
    console.error(err);
  });

app.post("/api/register", async (req, res) => {
  try {
    const user = await UserModel.create({
      username: req.body.username,
      password: bcrypt.hashSync(req.body.password, 12),
    });

    return res.json(user);
  } catch (e) {
    console.log(e);
    res.status(400).json(e);
  }
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  const userDoc = await UserModel.findOne({ username });

  !userDoc && res.json({ msg: "dosen't exists" });

  const passOk = bcrypt.compareSync(password, userDoc.password);
  if (passOk) {
    // logged in
    jwt.sign(
      { username, id: userDoc._id },
      process.env.JWT_SECRET,
      {
        expiresIn: "30d",
      },
      (err, token) => {
        if (err) throw err;
        res
          .cookie("token", token, {
            httpOnly: true,
            secure: true,
            sameSite: "strict",
            maxAge: 30 * 24 * 60 * 60 * 1000,
          })
          .json({
            id: userDoc._id,
            username,
          });
      }
    );
  } else {
    res.status(400).json({ msg: "username or pass is incorrect" });
  }
});

app.get("/api/profile", async (req, res) => {
  const { token } = req.cookies;
  if (token) {
    jwt.verify(token, process.env.JWT_SECRET, {}, async (err, userData) => {
      if (err) throw err;
      res.json(userData);
    });
  } else {
    res.json(null);
  }

  /* const { token } = req.cookies;
  jwt.verify(token, process.env.JWT_SECRET, (err, info) => {
    if (err) throw err;
    res.json(info);
  }); */
});

app.post("/api/logout", (req, res) => {
  res.cookie("token", "").json("ok");
});

// name file coming from FormData
// Multer configuration
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.post("/api/post", upload.single("file"), async (req, res) => {
  // Access form data using req.body
  const { title, summary, content } = req.body;

  // Access file using req.file
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const extension = file.originalname.split(".")[1];
  const newPath = Date.now() + "." + extension;

  // Assuming you have defined s3Client and bucket elsewhere
  try {
    const uploadParams = {
      Bucket: bucket,
      Key: newPath,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: "public-read",
    };
    await s3Client.send(new PutObjectCommand(uploadParams));
  } catch (err) {
    console.error("Error uploading file to S3:", err);
    return res.status(500).json({ error: "Failed to upload file to S3" });
  }

  // Assuming you have defined PostModel elsewhere
  const { token } = req.cookies;
  jwt.verify(token, process.env.JWT_SECRET, async (err, info) => {
    if (err) throw err;
    const postDoc = await PostModel.create({
      title,
      summary,
      content,
      author: info.id,
      cover: `https://${bucket}.s3.amazonaws.com/${newPath}`,
    });
    res.json(postDoc);
  });
});

app.put("/api/post", upload.single("file"), async (req, res) => {
  let newPath = null;
  if (req.file) {
    const { originalname, buffer, mimetype } = req.file;
    const parts = originalname.split(".");
    const ext = parts[parts.length - 1];
    newPath = Date.now() + "." + ext;

    // Upload file to S3
    try {
      const uploadParams = {
        Bucket: bucket,
        Key: newPath,
        Body: buffer,
        ContentType: mimetype,
        ACL: "public-read",
      };
      await s3Client.send(new PutObjectCommand(uploadParams));
    } catch (err) {
      console.error("Error uploading file to S3:", err);
      return res.status(500).json({ error: "Failed to upload file to S3" });
    }
  }

  const { token } = req.cookies;
  jwt.verify(token, process.env.JWT_SECRET, async (err, info) => {
    if (err) throw err;
    const { id, title, summary, content } = req.body;
    const postDoc = await PostModel.findById(id);
    const isAuthor = JSON.stringify(postDoc.author) === JSON.stringify(info.id);
    if (!isAuthor) {
      return res.status(400).json("You are not the author");
    }

    // Using findOneAndUpdate to update the document
    const updatedPost = await PostModel.findOneAndUpdate(
      { _id: id }, // filter
      {
        $set: {
          title,
          summary,
          content,
          cover: newPath
            ? `https://${bucket}.s3.amazonaws.com/${newPath}`
            : postDoc.cover, // Update cover URL if newPath exists
        },
      }, // update
      { new: true } // options to return the updated document
    );

    res.json(updatedPost);
  });
});

app.get("/api/post", async (req, res) => {
  const posts = await PostModel.find()
    .populate("author", ["username"])
    .sort({ createdAt: -1 })
    .limit(20);
  res.json(posts);
});

app.get("/api/post/:id", async (req, res) => {
  const { id } = req.params;
  const postDoc = await PostModel.findById(id).populate("author", ["username"]);
  res.json(postDoc);
});
