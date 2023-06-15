const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;
const initializeDbAndServer = async () => {
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });
  app.listen(4001, () => {
    console.log("Server Running...");
  });
};

initializeDbAndServer();

app.post("/register/", async (request, response) => {
  const userDetails = request.body;
  const { username, password, name, gender } = userDetails;
  const getUser = `
        SELECT *
        FROM
            user
        WHERE username = '${username}';`;
  const dbUser = await db.get(getUser);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const encryptPassword = await bcrypt.hash(password, 10);
      const addUserDetails = `
                INSERT INTO
                    user(username,password,name,gender)
                VALUES(
                    '${username}',
                    '${encryptPassword}',
                    '${name}',
                    '${gender}'
                    );`;
      await db.run(addUserDetails);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const loginDetails = request.body;
  const { username, password } = loginDetails;
  const getUserDetails = `
        SELECT *
        FROM 
            user
        WHERE username = '${username}';`;
  const dbUser = await db.get(getUserDetails);
  if (dbUser !== undefined) {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        userDetails: dbUser,
      };
      const jwtToken = jwt.sign(payload, "3344");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "3344", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.userDetails = payload.userDetails;
        next();
      }
    });
  }
};
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  let { userDetails } = request;
  let userId = userDetails.user_id;
  const getTweetsQuery = `
    SELECT 
        T.username AS username,
        tweet.tweet AS tweet,
        tweet.date_time AS date_time
    FROM 
        (user
        INNER JOIN follower
    ON user.user_id = follower.following_user_id) AS T
        INNER JOIN tweet
    ON T.following_user_id = tweet.user_id
    WHERE follower.follower_user_id = '${userId}'
    ORDER BY tweet.date_time DESC
    LIMIT 4 OFFSET 0;`;
  const tweetQuery = await db.all(getTweetsQuery);
  response.send(
    tweetQuery.map((eachTweet) => {
      return {
        username: eachTweet.username,
        tweet: eachTweet.tweet,
        dateTime: eachTweet.date_time,
      };
    })
  );
});

app.get("/user/following/", authenticateToken, async (request, response) => {
  let { userDetails } = request;
  let userId = userDetails.user_id;
  getUserFollowingQuery = `
    SELECT 
        user.name AS name
    FROM 
        user 
    INNER JOIN follower
    ON user.user_id = follower.following_user_id
    WHERE follower.follower_user_id = '${userId}';`;
  const followingUsers = await db.all(getUserFollowingQuery);
  response.send(followingUsers);
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  let { userDetails } = request;
  let userId = userDetails.user_id;
  getUserFollowersQuery = `
    SELECT 
        user.name AS name
    FROM 
        user 
    INNER JOIN follower
    ON user.user_id = follower.follower_user_id
    WHERE follower.following_user_id = '${userId}';`;
  const followersUsers = await db.all(getUserFollowersQuery);
  response.send(followersUsers);
});

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  let { userDetails } = request;
  let userId = userDetails.user_id;
  const { tweetId } = request.params;
  const getUserTweet = `
        SELECT 
            tweet.tweet
        FROM follower
        INNER JOIN tweet
        ON follower.following_user_id = tweet.user_id
        WHERE follower.follower_user_id = '${userId}'
        AND tweet.tweet_id = '${tweetId}';`;
  const userTweet = await db.get(getUserTweet);
  if (userTweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const getTweetDetails = `
        SELECT 
            T.tweet AS tweet,
            COUNT(DISTINCT T.like_id) AS likes,
            COUNT(DISTINCT reply.reply_id) AS replies,
            T.date_time AS dateTime
        FROM (tweet
            INNER JOIN like
        ON tweet.tweet_id = like.tweet_id) AS T
            INNER JOIN reply
        ON T.tweet_id = reply.tweet_id
        WHERE T.tweet_id = '${tweetId}';`;
    const tweetDetails = await db.get(getTweetDetails);
    response.send(tweetDetails);
  }
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    let { userDetails } = request;
    let userId = userDetails.user_id;
    const { tweetId } = request.params;
    const getUserTweet = `
        SELECT 
            tweet.tweet
        FROM follower
        INNER JOIN tweet
        ON follower.following_user_id = tweet.user_id
        WHERE follower.follower_user_id = '${userId}'
        AND tweet.tweet_id = '${tweetId}';`;
    const userTweet = await db.get(getUserTweet);
    if (userTweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getTweetLikeDetails = `
            SELECT user.username AS username
            FROM user 
                INNER JOIN like
            ON user.user_id = like.user_id
            WHERE like.tweet_id = '${tweetId}';`;
      const tweetLikeDetails = await db.all(getTweetLikeDetails);
      let userLikes = { likes: [] };
      tweetLikeDetails.map((eachUser) => {
        userLikes.likes.push(eachUser.username);
      });
      response.send(userLikes);
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    let { userDetails } = request;
    let userId = userDetails.user_id;
    const { tweetId } = request.params;
    const getUserTweet = `
        SELECT 
            tweet.tweet
        FROM follower
        INNER JOIN tweet
        ON follower.following_user_id = tweet.user_id
        WHERE follower.follower_user_id = '${userId}'
        AND tweet.tweet_id = '${tweetId}';`;
    const userTweet = await db.get(getUserTweet);
    if (userTweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getTweetReplyDetails = `
            SELECT user.name AS name,
                    reply.reply AS reply
            FROM user 
                INNER JOIN reply
            ON user.user_id = reply.user_id
            WHERE reply.tweet_id = '${tweetId}';`;
      const tweetReplyDetails = await db.all(getTweetReplyDetails);
      let userReplies = { replies: [] };
      tweetReplyDetails.map((eachUser) => {
        userReplies.replies.push(eachUser);
      });
      response.send(userReplies);
    }
  }
);

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  let { userDetails } = request;
  let userId = userDetails.user_id;
  const getUserTweetDetails = `
        SELECT 
            T.tweet AS tweet,
            COUNT(DISTINCT T.like_id) AS likes,
            COUNT(DISTINCT reply.reply_id) AS replies,
            T.date_time AS dateTime
        FROM (tweet
            INNER JOIN like
        ON tweet.tweet_id = like.tweet_id) AS T
            INNER JOIN reply
        ON T.tweet_id = reply.tweet_id
        GROUP BY T.tweet_id
        HAVING T.user_id = '${userId}';`;
  const userTweetDetails = await db.all(getUserTweetDetails);
  response.send(userTweetDetails);
});

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  let { userDetails } = request;
  let userId = userDetails.user_id;
  const { tweet } = request.body;
  const date = new Date();
  const dateTime = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
  const addTweetQuery = `
        INSERT INTO
            tweet(tweet,user_id,date_time)
        VALUES (
            '${tweet}',
            '${userId}',
            '${dateTime}'
            );`;
  const tweetQuery = await db.run(addTweetQuery);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    let { userDetails } = request;
    let userId = userDetails.user_id;
    const { tweetId } = request.params;
    const getValidUser = `
        SELECT *
        FROM tweet
        WHERE user_id = '${userId}'
        AND tweet_id = '${tweetId}';`;
    const validUser = await db.get(getValidUser);
    if (validUser === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getDeleteTweet = `
            DELETE FROM
                tweet
            WHERE 
                tweet_id = '${tweetId}';`;
      const deleteTweet = await db.run(getDeleteTweet);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
