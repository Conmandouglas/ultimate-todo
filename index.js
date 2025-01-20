import dotenv from "dotenv";
import express from "express";
import pg from "pg";

const app = express();
const port = 3000;

const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "the-todolist",
  password: "the_password",
  port: 5432,
});

db.connect().catch(err => console.log(err));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

async function checkItems() {
  try {
    let items = [];
    const result = await db.query('SELECT * FROM reminders ORDER BY id DESC;');
    items = result.rows;
    console.log(items);
    return items;
  } catch (err) {
    console.log("Error fetching reviews... " + err);
  }
}

app.get('/', async (req, res) => {
  const itemsList = await checkItems();
  res.render('index.ejs', {
    listTitle: 'Today', //will eventually be the name of the to do list
    items: itemsList
  });
});

app.post('/add', async (req, res) => {
  const item = req.body.newItem;

  try {
    await db.query('INSERT INTO reminders (title) VALUES ($1);', [
      item
    ]);
    res.redirect('/');
  } catch (err) {
    console.log(err);
  }
});

app.post('/edit', async (req, res) => {
  const updatedItemId = req.body.updatedItemId;
  const updatedItemTitle = req.body.updatedItemTitle;

  try {
    await db.query('UPDATE reminders SET title = $1 WHERE id = $2;', [
      updatedItemTitle, updatedItemId
    ]);
    res.redirect('/');
  } catch (err) {
    console.log(err);
  }
});

app.post('/delete', async (req, res) => {
  const selectedItemId = req.body.deleteItemId

  try {
    await db.query('DELETE FROM reminders WHERE id = $1', [selectedItemId]);
    res.redirect('/');
  } catch (err) {
    console.log(err);
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 