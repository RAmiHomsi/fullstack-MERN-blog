import Post from "../post";
import { useEffect, useState } from "react";

export default function IndexPage() {
  const [posts, setPosts] = useState([]);
  useEffect(() => {
    fetch(`${process.env.REACT_APP_BASE_URL}/post`).then((response) => {
      response.json().then((posts) => {
        setPosts(posts);
      });
    });
  }, [posts, setPosts]);

  return (
    <>
      {posts.length > 0 &&
        posts?.map((post, index) => <Post key={index} {...post} />)}
    </>
  );
}
