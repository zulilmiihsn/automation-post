const Database = require('better-sqlite3');
const db = new Database('data/database.sqlite');

try {
  db.prepare("BEGIN TRANSACTION").run();

  // 1. Create group
  const insertGroup = db.prepare("INSERT INTO app_groups (name, accounts, listings) VALUES (?, ?, ?)");
  
  // Get all accounts
  const accounts = db.prepare("SELECT id FROM accounts").all().map(a => a.id);
  
  // Get all motor listings
  const motors = db.prepare("SELECT * FROM listings WHERE category = 'Kendaraan'").all();
  
  const newListingsIds = [];
  const insertListing = db.prepare(`
    INSERT INTO listings (
      title, price, description, category, condition, availability, 
      location, tags, sku, targetGroup, maxGroups, isActive, 
      photoDir, photos, attributes, status, last_posted, autoFeed, 
      existingPostUrl, postMarketplace, commentTargetUrl, photoUsage
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `);

  for (const motor of motors) {
    // Append attributes to description if needed for Lain-lain
    let newDesc = motor.description;
    try {
      const attrs = JSON.parse(motor.attributes);
      const specs = Object.entries(attrs).map(([k, v]) => `${k}: ${v}`).join('\n');
      if (specs) {
        newDesc += '\n\nSpesifikasi:\n' + specs;
      }
    } catch(e) {}

    const info = insertListing.run(
      motor.title,
      motor.price,
      newDesc,
      'Lain-lain', // Change category
      motor.condition,
      motor.availability,
      motor.location,
      motor.tags,
      motor.sku,
      motor.targetGroup,
      motor.maxGroups,
      1, // isActive
      motor.photoDir,
      motor.photos,
      motor.attributes, // keep attributes just in case
      'pending', // reset status
      null, // reset last_posted
      motor.autoFeed,
      '', // new post, no url yet
      motor.postMarketplace,
      '',
      motor.photoUsage
    );
    newListingsIds.push(info.lastInsertRowid);
  }

  // Insert group
  insertGroup.run("Jualan Hendy 2", JSON.stringify(accounts), JSON.stringify(newListingsIds));
  
  db.prepare("COMMIT").run();
  console.log("Success! Created group 'Jualan Hendy 2' with", accounts.length, "accounts and", newListingsIds.length, "listings.");
} catch (error) {
  db.prepare("ROLLBACK").run();
  console.error("Failed:", error);
}
