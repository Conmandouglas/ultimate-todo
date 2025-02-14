import express from "express";
import pg from "pg";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy } from "passport-local";
import GoogleStrategy from "passport-google-oauth2";
import session from "express-session";
import env from "dotenv";

const app = express();
const port = 3000;
const saltRounds = 10;
env.config();

app.set('view engine', 'ejs');

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);

app.use(express.urlencoded({ extended: true })); 
app.use(express.static("public"));

app.use(passport.initialize());
app.use(passport.session());

const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});
db.connect();

async function checkItems(req, listId) {
  try {
    const userId = req.isAuthenticated() ? req.user.id : null; // Check if user is authenticated
    let items = [];
    let lists = [];

    if (userId) {
      // Query lists for the user
      const result = await db.query('SELECT * FROM lists WHERE user_id = $1 ORDER BY id DESC;', [userId]);
      lists = result.rows || []; // Ensure lists is always an array
    }

    let listTitle = 'No List'; // Default list title
    const selectedList = lists.find(l => l.id == listId); // Find the selected list by listId

    if (selectedList) {
      listTitle = selectedList.name; // Set the list title from the selected list
      // Query reminders based on the selected list id
      const reminderResult = await db.query('SELECT * FROM reminders WHERE listid = $1 ORDER BY id DESC', [listId]);
      items = reminderResult.rows || []; // Ensure items is always an array
    }

    return { items, listTitle, lists }; // Return both items and listTitle
  } catch (err) {
    console.error("Error fetching reminders: " + err);
    return { items: [], listTitle: 'Error' }; // Return empty array and error title in case of an error
  }
}

app.get('/', async (req, res) => {
  const userId = req.isAuthenticated() ? req.user.id : null;

  if (userId) {
    // Query lists for the user
    const result = await db.query('SELECT * FROM lists WHERE user_id = $1 ORDER BY id DESC;', [userId]);
    const lists = result.rows || []; // Ensure lists is always an array

    if (lists.length > 0) {
      // Redirect to the first list (e.g., /list-1)
      res.redirect(`/list-${lists[0].id}`);
    } else {
      // If no lists are found, render the homepage with no lists
      res.render('index.ejs', {
        listTitle: 'No List',
        items: [],
        lists: [],
        username: req.isAuthenticated() ? req.user.username : null,
      });
    }
  } else {
    // If not authenticated, redirect to login
    res.redirect('/login');
  }
});


app.get('/list-:listId', async (req, res) => {
  const { listId } = req.params; // Capture the listId from the URL
  const { items, listTitle, lists } = await checkItems(req, listId); // Pass listId to checkItems function

  // Check if the user is authenticated to access their username
  const username = req.isAuthenticated() ? req.user.username : null;

  res.render('index.ejs', {
    listTitle: listTitle,  // Pass listTitle to EJS page
    items: items,          // Pass items to EJS page
    lists: lists,
    username: username,    // Pass username to EJS page
    listId: listId,
  });
});

app.get("/login", (req, res) => {
  res.render("login.ejs");
});

// Redirect to Google for authentication
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    // Successful authentication, redirect to the homepage
    res.redirect('/');
  }
);



app.get("/register", (req, res) => {
  res.render("register.ejs");
});

app.get("/logout", (req, res) => {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
});

app.get('/submit', (req, res) => {
  if (req.isAuthenticated()) {
    res.redirect('/');
  } else {
    res.redirect('/login');
  }

});

app.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/login",
  })
);

app.post("/register", async (req, res) => {
  const email = req.body.username;
  const password = req.body.password;

  try {
    const checkResult = await db.query("SELECT * FROM users WHERE username = $1", [
      email,
    ]);

    if (checkResult.rows.length > 0) {
      res.redirect("/login");
    } else {
      bcrypt.hash(password, saltRounds, async (err, hash) => {
        if (err) {
          console.error("Error hashing password:", err);
        } else {
          const result = await db.query(
            "INSERT INTO users (username, password) VALUES ($1, $2) RETURNING *",
            [email, hash]
          );
          const user = result.rows[0];
          req.login(user, (err) => {
            console.log("success");
            res.redirect("/");
          });
        }
      });
    }
  } catch (err) {
    console.log(err);
  }
});

app.post('/add', async (req, res) => {
  const item = req.body.newItem;
  const listId = req.body.listId;

  try {
    await db.query('INSERT INTO reminders (title, listid) VALUES ($1, $2);', [
      item, listId
    ]);
    res.redirect(`/list-${listId}`);
  } catch (err) {
    console.log(err);
  }
});

app.post('/edit', async (req, res) => {
  const updatedItemId = req.body.updatedItemId;
  const updatedItemTitle = req.body.updatedItemTitle;
  const listId = req.body.listId;

  try {
    await db.query('UPDATE reminders SET title = $1 WHERE id = $2;', [
      updatedItemTitle, updatedItemId
    ]);
    res.redirect(`/list-${listId}`);
  } catch (err) {
    console.log(err);
  }
});

app.post('/delete', async (req, res) => {
  const selectedItemId = req.body.deleteItemId;
  const listId = req.body.listId;

  try {
    await db.query('DELETE FROM reminders WHERE id = $1', [selectedItemId]);
    res.redirect(`/list-${listId}`);
  } catch (err) {
    console.log(err);
  }
});

// Route to display the Add List form
app.get('/addlist', (req, res) => {
  if (!req.user) {
    return res.redirect('/login'); // Redirect if not logged in
  }
  res.render('addlist'); // Render the form to add a new list
});

// Route to handle the form submission (creating a new list)
app.post('/addlist', (req, res) => {
  const { title } = req.body;
  const userId = req.user.id; // Assuming you store the user ID in req.user

  // Insert the new list into the database
  const query = 'INSERT INTO lists (name, user_id) VALUES ($1, $2) RETURNING id';
  const values = [title, userId];

  db.query(query, values)
    .then(result => {
      // After successful insertion, redirect to the main page
      res.redirect('/');
    })
    .catch(err => {
      console.error(err);
      res.status(500).send('Error creating list');
    });
});

passport.use(
  "local",
  new Strategy(async function verify(username, password, cb) {
    try {
      const result = await db.query("SELECT * FROM users WHERE username = $1 ", [
        username,
      ]);
      if (result.rows.length > 0) {
        const user = result.rows[0];
        const storedHashedPassword = user.password;
        bcrypt.compare(password, storedHashedPassword, (err, valid) => {
          if (err) {
            console.error("Error comparing passwords:", err);
            return cb(err);
          } else {
            if (valid) {
              return cb(null, user);
            } else {
              return cb(null, false);
            }
          }
        });
      } else {
        return cb("User not found");
      }
    } catch (err) {
      console.log(err);
    }
  })
);

passport.use(
  "google",
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "http://localhost:3000/auth/google/callback", // Updated to match the standard callback
      userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
    },
    async (accessToken, refreshToken, profile, cb) => {
      try {
        // Extract email from profile
        const email = profile.emails[0].value;

        // Check if the user exists in the database
        const result = await db.query("SELECT * FROM users WHERE username = $1", [email]);

        if (result.rows.length === 0) {
          // Create a new user if they don't exist
          const newUser = await db.query(
            "INSERT INTO users (username, password) VALUES ($1, $2) RETURNING *",
            [email, "google"]
          );
          return cb(null, newUser.rows[0]); // Pass the new user to the callback
        } else {
          // User exists, pass the user to the callback
          return cb(null, result.rows[0]);
        }
      } catch (err) {
        console.error("Error during Google OAuth:", err);
        return cb(err); // Pass error to Passport
      }
    }
  )
);



passport.serializeUser((user, cb) => {
  cb(null, user);
});

passport.deserializeUser((user, cb) => {
  cb(null, user);
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 