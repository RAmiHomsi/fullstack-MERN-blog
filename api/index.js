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
const uploadMiddleware = multer({ dest: "uploads/" });
const fs = require("fs");

app.use(express.json());
app.use(cookieParser());
app.use(cors({ credentials: true, origin: "http://localhost:3000" }));
app.use("/uploads", express.static(__dirname + "/uploads"));

require("dotenv").config();

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

app.post("/register", async (req, res) => {
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

app.post("/login", async (req, res) => {
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

app.get("/profile", async (req, res) => {
  mongoose.connect(process.env.MONGO_URL);
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

app.post("/logout", (req, res) => {
  res.cookie("token", "").json("ok");
});

// name file coming from FormData
app.post("/post", uploadMiddleware.single("file"), async (req, res) => {
  const { originalname, path } = req.file;
  const parts = originalname.split(".");
  const extention = parts[parts.length - 1];
  const newPath = path + "." + extention;
  fs.renameSync(path, newPath);

  const { token } = req.cookies;
  jwt.verify(token, process.env.JWT_SECRET, async (err, info) => {
    if (err) throw err;
    const postDoc = await PostModel.create({
      title: req.body.title,
      summary: req.body.summary,
      content: req.body.content,
      author: info.id,
      cover: newPath,
    });
    res.json(postDoc);
  });
});

app.put("/post", uploadMiddleware.single("file"), async (req, res) => {
  let newPath = null;
  if (req.file) {
    const { originalname, path } = req.file;
    const parts = originalname.split(".");
    const ext = parts[parts.length - 1];
    newPath = path + "." + ext;
    fs.renameSync(path, newPath);
  }

  const { token } = req.cookies;
  jwt.verify(token, process.env.JWT_SECRET, async (err, info) => {
    if (err) throw err;
    const { id, title, summary, content } = req.body;
    const postDoc = await PostModel.findById(id);
    const isAuthor = JSON.stringify(postDoc.author) === JSON.stringify(info.id);
    if (!isAuthor) {
      return res.status(400).json("you are not the author");
    }
    // Using findOneAndUpdate to update the document
    const updatedPost = await PostModel.findOneAndUpdate(
      { _id: id }, // filter
      {
        $set: {
          title,
          summary,
          content,
          cover: newPath ? newPath : postDoc.cover,
        },
      }, // update
      { new: true } // options to return the updated document
    );

    res.json(updatedPost);
  });
});

app.get("/post", async (req, res) => {
  const posts = await PostModel.find()
    .populate("author", ["username"])
    .sort({ createdAt: -1 })
    .limit(20);
  res.json(posts);
});

app.get("/post/:id", async (req, res) => {
  const { id } = req.params;
  const postDoc = await PostModel.findById(id).populate("author", ["username"]);
  res.json(postDoc);
});
