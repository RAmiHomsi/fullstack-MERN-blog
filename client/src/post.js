import { Link } from "react-router-dom";

export default function Post(props) {
  return (
    <div className="post">
      <div className="image">
        <Link to={`/post/${props._id}`}>
          <img src={"http://localhost:3001/" + props.cover} alt="" />
        </Link>
      </div>
      <div className="texts">
        <Link to={`/post/${props._id}`}>
          <h2>{props.title}</h2>
        </Link>
        <p className="info">
          <button className="author">{props.author.username}</button>
          <time>{new Date(props.createdAt).toLocaleString()}</time>
        </p>
        <p className="summary">{props.summary}</p>
      </div>
    </div>
  );
}
