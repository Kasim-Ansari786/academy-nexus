import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import pg from "pg";
import multer from "multer";
import path from "path";
import fs from "fs";
import jwt from "jsonwebtoken";

const { Pool } = pg;

const app = express();


const PORT = process.env.PORT || 5000;

// ---------------------------------------------
// DB CONNECTION
// ---------------------------------------------
const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "admincomdata",
  password: "Admin@123",
  port: 5432,
});
const JWT_SECRET = "SECRET_KEY";
app.use(
  cors({
    origin: ["http://localhost:3000", "http://localhost:8080"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

app.use(express.json());

// ---------------------------------------------
// CREATE UPLOADS FOLDER (FIXED LOCATION)
// ---------------------------------------------
const UPLOAD_DIR = path.resolve("uploads"); // <-- UPLOAD_DIR DEFINED HERE

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  console.log("✔ Uploads folder created:", UPLOAD_DIR);
}

// ---------------------------------------------
// SERVE STATIC UPLOADS (UPLOAD_DIR IS NOW READY)
// ---------------------------------------------
app.use("/uploads", express.static(UPLOAD_DIR));

// ---------------------------------------------
// MULTER STORAGE
// ---------------------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },

  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + unique + path.extname(file.originalname));
  },
});

// These names must match your React formData keys EXACTLY
const upload = multer({ storage }).fields([
  { name: "profile_photo_path", maxCount: 1 },
  { name: "aadhar_upload_path", maxCount: 1 },
  { name: "birth_certificate_path", maxCount: 1 },
]);

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (token == null)
    return res.status(401).json({ error: "Access Denied: No Token Provided" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err)
      return res.status(403).json({ error: "Access Denied: Invalid Token" }); // <-- This is where the error originates
    req.user = user;
    next();
  });
};

// ---------------------------------------------
// SIGNUP
// ---------------------------------------------
app.post("/api/signup", async (req, res) => {
  const { email, password, name, role } = req.body;

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `
      INSERT INTO cd.users_login (full_name, email, password_hash, role)
      VALUES ($1, $2, $3, $4)
      RETURNING id, email, role;
      `,
      [name, email, hash, role]
    );

    res.status(201).json({ message: "Success", user: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Signup failed" });
  }
});

// ---------------------------------------------
// LOGIN
// ---------------------------------------------
// server.js (or login route file)

app.post("/api/login", async (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !password || !role) {
    return res.status(400).json({ error: "Missing email, password, or role." });
  }

  try {
    const result = await pool.query(
      `SELECT id, full_name, email, role, password_hash FROM cd.users_login WHERE email = $1`,
      [email]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password." });
    }
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: "Invalid email or password." });
    }
    if (user.role !== role) {
      return res.status(403).json({ error: "Access denied for this role." });
    }
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      JWT_SECRET,
      {
        expiresIn: "1h",
      }
    );

    res.json({
      message: "Login success",
      token: token,
      user: {
        id: user.id,
        name: user.full_name,
        role: user.role,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Login Server Error (500):", error);
    res
      .status(500)
      .json({ error: "Internal Server Error during login process." });
  }
});
// ---------------------------------------------
// GET PLAYERS
// ---------------------------------------------
app.get("/api/players-details", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, player_id, name, age, address, phone_no, center_name, coach_name, category, status
      FROM cd.player_details 
      ORDER BY id,player_id DESC;
    `);

    res.json(result.rows);
  } catch {
    res.status(500).json({ error: "Fetch failed" });
  }
});

// ---------------------------------------------
// ADD PLAYER (FIXED)
// ---------------------------------------------
app.post("/api/players-add", (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      console.log("❌ Multer upload error:", err);
      return res.status(400).json({ error: "File upload failed" });
    }

    const filePath = (field) => {
      if (req.files && req.files[field] && req.files[field].length > 0) {
        return `/uploads/${req.files[field][0].filename}`; 
      }
      return null;
    };

    const profile_photo_path = filePath("profile_photo_path");
    const aadhar_upload_path = filePath("aadhar_upload_path");
    const birth_certificate_path = filePath("birth_certificate_path");

    const data = req.body;

    const numericAge = Number(data.age) || null;

    try {
      const query = `
        INSERT INTO cd.player_details (
          name, age, address, father_name, mother_name, gender, 
          date_of_birth, blood_group, email_id, emergency_contact_number, 
          guardian_contact_number, guardian_email_id, medical_condition, 
          aadhar_upload_path, birth_certificate_path, profile_photo_path, phone_no
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17
        )
        RETURNING player_id, name; 
      `;
     
      const result = await pool.query(query, [
        data.name, 
        numericAge, 
        data.address, 
        
        data.father_name, 
        data.mother_name, 
        data.gender, 
        data.date_of_birth, 
        data.blood_group, 
        data.email_id,
        
        data.emergency_contact_number, 
        data.guardian_contact_number, 
        data.guardian_email_id, 
        
        data.medical_condition,
        
        aadhar_upload_path, 
        birth_certificate_path, 
        profile_photo_path, 
        
        data.phone_no, 
      ]);

      res.status(201).json({
        message: "Player added successfully",
        player: result.rows[0],
      });
    } catch (error) {
      console.error("❌ Database insert failed:", error.message, error.detail);

      if (error.code === "23505") {
        return res.status(409).json({
          error: `A player with this email address already exists.`,
          details: error.detail,
        });
      }
      
      res.status(500).json({
        error: "Internal Server Error: Database insertion failed.",
        details: error.message,
      });
    }
  });
});

//coach list by the add players coact name list
app.post("/api/players-add", (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      console.log("❌ Multer upload error:", err);
      return res.status(400).json({ error: "File upload failed" });
    }

    // CORRECT: Logic to extract file paths saved in the 'uploads' folder
    const filePath = (field) => {
      if (req.files && req.files[field] && req.files[field].length > 0) {
        return `/uploads/${req.files[field][0].filename}`; 
      }
      return null;
    };

    const profile_photo_path = filePath("profile_photo_path");
    const aadhar_upload_path = filePath("aadhar_upload_path");
    const birth_certificate_path = filePath("birth_certificate_path");

    const data = req.body;

    const numericAge = Number(data.age) || null;

    try {
      const query = `
        INSERT INTO cd.player_details (
          name, age, address, father_name, mother_name, gender, 
          date_of_birth, blood_group, email_id, emergency_contact_number, 
          guardian_contact_number, guardian_email_id, medical_condition, 
          aadhar_upload_path, birth_certificate_path, profile_photo_path, phone_no
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17
        )
        RETURNING player_id, name; 
      `;
     
      const result = await pool.query(query, [
        data.name, 
        numericAge, 
        data.address, 
        data.father_name, 
        data.mother_name, 
        data.gender, 
        data.date_of_birth, 
        data.blood_group, 
        data.email_id,
        data.emergency_contact_number, 
        data.guardian_contact_number, 
        data.guardian_email_id, 
        data.medical_condition,
        aadhar_upload_path, 
        birth_certificate_path, 
        profile_photo_path, 
        data.phone_no, 
      ]);

      res.status(201).json({
        message: "Player added successfully",
        player: result.rows[0],
      });
    } catch (error) {
      console.error("❌ Database insert failed:", error.message, error.detail);

      if (error.code === "23505") {
        return res.status(409).json({
          error: `A player with this email address already exists.`,
          details: error.detail,
        });
      }
      
      res.status(500).json({
        error: "Internal Server Error: Database insertion failed.",
        details: error.message,
      });
    }
  });
});
//---------------------------------------------
//Edit the player details
//---------------------------------------------
app.get("/api/Player-edit", async (req, res) => {
  // We will use a dedicated client from the pool to ensure proper transaction management (though optional for a SELECT)
  let client;
  try {
    // 1. Extract parameters from the request query string
    const { id, player_id } = req.query;

    // 2. Validate essential parameters (already correct)
    if (!id || !player_id) {
      return res
        .status(400)
        .json({ error: "Missing required parameters: id and player_id" });
    }

    // --- Database Connection FIX ---
    // Get a client from the connection pool
    client = await pool.connect();

    const queryText = `
            SELECT 
                id,
                name,
                age,
                address,
                center_name,
                coach_name,
                category,
                active,
                status,
                father_name,
                mother_name,
                gender,
                date_of_birth,
                blood_group,
                email_id,
                emergency_contact_number,
                guardian_contact_number,
                guardian_email_id,
                medical_condition,
                aadhar_upload_path,
                birth_certificate_path,
                profile_photo_path,
                phone_no 
            FROM 
                cd.player_details 
            WHERE 
                id = $1 
                AND player_id = $2;
        `;

    // 3. Execute the query using the connected client
    const result = await client.query(queryText, [id, player_id]);

    // 4. Send the single fetched row as JSON response
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Player details not found for the given IDs." });
    }

    res.json(result.rows[0]);
  } catch (error) {
    // 5. Handle any server/database errors
    console.error("Error fetching player details:", error);
    res.status(500).json({
      error: "Internal Server Error",
      details: error.message,
    });
  } finally {
    // 6. Release the client back to the pool
    if (client) {
      client.release();
    }
  }
});

// ---------------------------------------------
// UPDATE PLAYER (FIXED)
// ---------------------------------------------
app.put("/api/Player-Edit/:id", async (req, res) => {
  try {
    const playerIdFromUrl = req.params.id;
    if (!playerIdFromUrl) {
      return res.status(400).json({ error: "Missing player id in URL." });
    }

    // Destructure expected fields (will be undefined if not provided)
    const {
      name,
      age,
      address,
      center_name,
      coach_name,
      category,
      active,
      status,
      father_name,
      mother_name,
      gender,
      date_of_birth,
      blood_group,
      email_id,
      emergency_contact_number,
      guardian_contact_number,
      guardian_email_id,
      medical_condition,
      aadhar_upload_path,
      birth_certificate_path,
      profile_photo_path,
      phone_no,
    } = req.body;

    // Basic validation example: at least one field to update
    if (
      name === undefined &&
      age === undefined &&
      address === undefined &&
      center_name === undefined &&
      coach_name === undefined &&
      category === undefined &&
      active === undefined &&
      status === undefined &&
      father_name === undefined &&
      mother_name === undefined &&
      gender === undefined &&
      date_of_birth === undefined &&
      blood_group === undefined &&
      email_id === undefined &&
      emergency_contact_number === undefined &&
      guardian_contact_number === undefined &&
      guardian_email_id === undefined &&
      medical_condition === undefined &&
      aadhar_upload_path === undefined &&
      birth_certificate_path === undefined &&
      profile_photo_path === undefined &&
      phone_no === undefined
    ) {
      return res.status(400).json({ error: "No fields provided to update." });
    }

    // Convert types if DB expects specific types
    // Example: if 'active' is stored as boolean in DB, ensure boolean
    const activeBool =
      typeof active === "boolean"
        ? active
        : active === "true" || active === 1 || active === "1";

    // If date_of_birth might include time, try to keep only date part for DB DATE column
    const dob = date_of_birth
      ? new Date(date_of_birth).toISOString().split("T")[0]
      : null;

    const sql = `
      UPDATE cd.player_details
      SET
        name = $1, age = $2, address = $3, center_name = $4, coach_name = $5,
        category = $6, active = $7, status = $8, father_name = $9,
        mother_name = $10, gender = $11, date_of_birth = $12, blood_group = $13,
        email_id = $14, emergency_contact_number = $15,
        guardian_contact_number = $16, guardian_email_id = $17,
        medical_condition = $18, aadhar_upload_path = $19,
        birth_certificate_path = $20, profile_photo_path = $21, phone_no = $22
      WHERE player_id = $23
    `;

    const values = [
      name ?? null,
      age ?? null,
      address ?? null,
      center_name ?? null,
      coach_name ?? null,
      category ?? null,
      activeBool,
      status ?? null,
      father_name ?? null,
      mother_name ?? null,
      gender ?? null,
      dob,
      blood_group ?? null,
      email_id ?? null,
      emergency_contact_number ?? null,
      guardian_contact_number ?? null,
      guardian_email_id ?? null,
      medical_condition ?? null,
      aadhar_upload_path ?? null,
      birth_certificate_path ?? null,
      profile_photo_path ?? null,
      phone_no ?? null,
      playerIdFromUrl,
    ];

    // Log input for debugging (remove/disable in production)
    console.log("Updating player:", playerIdFromUrl, "payload:", req.body);

    const result = await pool.query(sql, values);

    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ error: "Player not found or player_id incorrect." });
    }

    return res.status(200).json({
      message: "Player details updated successfully",
      rowCount: result.rowCount,
    });
  } catch (err) {
    console.error("Error executing update query:", err);
    // Return the error message to the client, but avoid leaking stack in production
    return res.status(500).json({
      error: "Failed to update player details",
      details: err.message || String(err),
    });
  }
});

// ---------------------------------------------
//DELETE route to remove a player by ID
// ---------------------------------------------
// DELETE Route (Deactivate Player) - Logic provided by user
app.delete("/api/Player-Delete/:id", async (req, res) => {
  try {
    const playerIdFromUrl = req.params.id;

    // SQL to logically delete (deactivate) the player
    const sql = `
            UPDATE cd.player_details 
            SET active = FALSE, status = 'Inactive' 
            WHERE id = $1
            RETURNING id, name;
        `;

    const result = await pool.query(sql, [playerIdFromUrl]);

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Player not found or ID was incorrect. No record updated.",
      });
    }

    // Success response
    res.status(200).json({
      message: `Player ID ${result.rows[0].id} successfully deactivated`,
      playerId: result.rows[0].id,
    });
  } catch (error) {
    console.error("Error executing delete query:", error.message);
    res.status(500).json({
      error: "Failed to deactivate player details",
      details: error.message,
    });
  }
});

// 1. POST Route for adding a new coach (INSERT)
app.post("/api/coaches-add", async (req, res) => {
  try {
    const {
      coach_name,
      phone_numbers,
      email,
      address,
      players = 0,
      salary,
      attendance, // This field was NOT in the SQL VALUES list!
      week_salary = 0,
      category = "Other",
      active = true,
      status = "Active",
    } = req.body;

    // 1. Validate mandatory fields
    const numericSalary = Number(salary);
    if (
      !coach_name ||
      !email ||
      !salary ||
      isNaN(numericSalary) ||
      numericSalary < 0
    ) {
      return res.status(400).json({
        error:
          "Missing or invalid required fields (name, email, salary must be positive number).",
      });
    }

    // 2. Convert numerical/boolean fields
    const numericWeekSalary = Number(week_salary) || 0;
    const numericPlayers = Number(players) || 0;
    // FIX APPLIED: Ensure 'active' is correctly parsed to a boolean for the DB.
    const isActive = active === true || active === "true" || active === 1;

    const sql = `
        INSERT INTO cd.coaches_details
            (coach_name, phone_numbers, email, address, players, salary, week_salary, category, active, status, attendance)
        VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING coach_id, coach_name; 
    `;

    // FIX APPLIED: Re-ordered the values array to match the $1, $2, ... placeholders in the SQL query.
    const values = [
      coach_name, // $1
      phone_numbers, // $2
      email, // $3
      address, // $4
      numericPlayers, // $5
      numericSalary, // $6
      numericWeekSalary, // $7
      category, // $8
      isActive, // $9 (ACTIVE)
      status, // $10 (STATUS)
      attendance, // $11 (ATTENDANCE)
    ];

    const result = await pool.query(sql, values);

    // Ensure the response matches the client-side expectations (e.g., uses the 'coach' key)
    res.status(201).json({
      message: "Coach successfully added.",
      coach: result.rows[0], // Contains 'coach_id' and 'coach_name'
    });
  } catch (error) {
    console.error("❌ Database insertion error for coach:", error.message);
    res.status(500).json({
      error: "Failed to add coach details due to a server error.",
      details: error.message,
    });
  }
});


//assgin the coach and players 
//coach list by the add players coact name list
app.get("/api/coaches-list", async (req, res) => {
  console.log("Received request for coach list...");

  // Your specific SQL query
  const sqlQuery = `SELECT coach_id, coach_name,category FROM cd.coaches_details ORDER BY coach_id ASC`;

  try {
    const client = await pool.connect();

    // Execute the query
    const result = await client.query(sqlQuery);
    client.release();
    console.log(`Successfully retrieved ${result.rows.length} coaches.`);
    return res.json(result.rows);
  } catch (err) {
    console.error("Error executing query for coaches:", err.stack);
    // Send a 500 Internal Server Error response
    return res.status(500).json({
      message: "Failed to fetch coach list from the database.",
      error: err.message,
    });
  }
});

// ---------------------------------------------
//COACHES GET ROUTE
// ---------------------------------------------
app.get("/api/coach-details", async (req, res) => {
  try {
    const queryText = `
        SELECT coach_id,
          players,
          coach_name,
          phone_numbers,
          salary,
          email,
          address,
          attendance,
          week_salary,
          category,
           status
     FROM cd.coaches_details ORDER BY coach_id DESC 
    `;
    const result = await pool.query(queryText);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching coach data:", error);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
});

// ---------------------------------------------
//update the coach details
// ---------------------------------------------
app.put("/api/coaches-update/coach_id", async (req, res) => {
  try {
    const {
      coach_id,
      coach_name,
      phone_numbers,
      email,
      address,
      salary,
      week_salary,
      active,
      status,
    } = req.body;

    // 1. Validate mandatory fields (using destructured names)
    const numericCoachId = Number(coach_id);
    const numericSalary = Number(salary);

    if (
      !coach_id ||
      isNaN(numericCoachId) ||
      numericCoachId <= 0 ||
      !coach_name ||
      !email ||
      !salary ||
      isNaN(numericSalary) ||
      numericSalary < 0
    ) {
      return res.status(400).json({
        error:
          "Missing or invalid required fields (coach_id, name, email, salary must be valid).",
      });
    }

    // 2. Convert numerical/boolean fields
    const numericWeekSalary = Number(week_salary) || 0;
    // Ensure 'active' is a proper boolean value for PostgreSQL
    const isActive = active === true || active === "true" || active === 1;

    // 3. The FIXED SQL UPDATE query (Cleaned of all non-standard whitespace)
    const sql = `
        UPDATE cd.coaches_details
        SET 
          coach_name = $1,
          phone_numbers = $2,
          email = $3,
          address = $4,
          salary = $5,
          week_salary = $6,
          active = $7,
          status = $8
        WHERE coach_id = $9
        RETURNING "coach_id", "coach_name", "status";
      `;

    // 4. Values array (9 parameters)
    const values = [
      coach_name, // $1
      phone_numbers, // $2
      email, // $3
      address, // $4
      numericSalary, // $5
      numericWeekSalary, // $6
      isActive, // $7
      status, // $8
      numericCoachId, // $9 (WHERE clause)
    ];

    const result = await pool.query(sql, values);

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: `Coach with ID ${coach_id} not found.`,
      });
    }

    res.status(200).json({
      message: "Coach successfully updated.",
      coach: result.rows[0],
    });
  } catch (error) {
    // This is the error handler that returned the 500 status.
    console.error("❌ Database update error for coach:", error.message);
    res.status(500).json({
      error: "Failed to update coach details due to a server error.",
      details: error.message,
    });
  }
});

// ---------------------------------------------
//DELETE the coach details
// ---------------------------------------------
app.put("/api/coaches-deactivate/:coach_id", async (req, res) => {
  try {
    const coachIdParam = req.params.coach_id;
    const numericCoachId = Number(coachIdParam);

    if (isNaN(numericCoachId) || numericCoachId <= 0) {
      return res.status(400).json({
        error: "Invalid coach ID provided in the URL.",
      });
    }

    const sql = `
            UPDATE cd.coaches_details 
            SET 
                active = FALSE, 
                status = 'Inactive' 
            WHERE coach_id = $1
            RETURNING coach_id, coach_name, status; 
        `;

    const values = [numericCoachId];
    const result = await pool.query(sql, values);

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: `Coach with ID ${numericCoachId} not found.`,
      });
    }

    res.status(200).json({
      message: "Coach successfully deactivated.",
      coach: result.rows[0],
    });
  } catch (error) {
    console.error("❌ Database deactivation error for coach:", error.message);
    res.status(500).json({
      error: "Failed to deactivate coach due to a server error.",
      details: error.message,
    });
  }
});

// 4. API Endpoint to fetch player data
app.get("/api/players-agssign", async (req, res) => {
  try {
    const result = await pool.query(`
        SELECT player_id, id, name,category,coach_name,coach_id  FROM cd.player_details ORDER BY player_id, id asc;
      `);

    // Map the DB result to a cleaner JSON format expected by the frontend
    const players = result.rows.map((row) => ({
      id: row.id, // Primary key
      player_id: row.player_id, // Secondary ID/Legacy ID
      name: row.name,
      coachId: row.coach_id,
      category: row.category,
      coach_name: row.coach_name, // Must be present for assignment logic
      // You might add other fields like position, status, etc.
    }));

    // Return the data as a JSON response
    res.json({
      status: "success",
      count: players.length,
      players: players,
    });
  } catch (error) {
    console.error("Error executing query:", error.stack);
    // Send a 500 error response
    res.status(500).json({
      status: "error",
      message: "Failed to retrieve player data from the database.",
      details: error.message,
    });
  }
});

//Update the assigned coach to player
app.post("/api/update-coach", async (req, res) => {
  const { coach_name, coach_id, player_id, id } = req.body;

  if (
    !coach_name ||
    coach_id === undefined ||
    player_id === undefined ||
    id === undefined
  ) {
    return res
      .status(400)
      .json({
        error:
          "Missing required parameters: coach_name, coach_id, player_id, or id.",
      });
  }

  const sqlQuery = `
        UPDATE cd.player_details
        SET coach_name = $1,
            coach_id = $2
        WHERE player_id = $3 AND id = $4; 
    `;

  // C. Define the parameters array for parameterized query
  const values = [coach_name, coach_id, player_id, id];

  try {
    // D. Execute the query using the connection pool
    const result = await pool.query(sqlQuery, values);

    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ message: "No record found matching the criteria for update." });
    }

    // E. Send a successful response
    res.status(200).json({
      message: "Coach assigned successfully.",
      updatedRows: result.rowCount,
    });
  } catch (err) {
    console.error("Database update error:", err);
    res
      .status(500)
      .json({
        error: "Failed to update coach assignment.",
        details: err.message,
      });
  }
});

//venue data formatting function
const formatVenueData = (rows) => {
    const venuesMap = new Map();

    rows.forEach(row => {
        // Ensure these match the double-quoted aliases in the SQL query
        const {
            id, name, centerHead, address, googleMapsUrl,
            timeslotId, startTime, endTime, day
        } = row;

        // 1. Create the main venue entry if it doesn't exist
        if (!venuesMap.has(id)) {
            venuesMap.set(id, {
                id,
                name,
                centerHead,
                address,
                googleMapsUrl,
                operatingHours: [], // Array to hold all time slots
            });
        }

        const venue = venuesMap.get(id);

        // 2. Only add time slots if the necessary data is present (non-NULL from LEFT JOIN)
        if (timeslotId && startTime && endTime && day) {
            
            // Prevent duplicate slots if ORDER BY logic is complex
            const isSlotAlreadyAdded = venue.operatingHours.some(
                slot => slot.day === day && slot.startTime === startTime && slot.endTime === endTime
            );

            if (!isSlotAlreadyAdded) {
                 venue.operatingHours.push({
                    day: day,
                    startTime: startTime,
                    endTime: endTime,
                    timeslotId: timeslotId, 
                });
            }
        }
    });

    // Convert Map values back to an array for the response
    return Array.from(venuesMap.values());
};

//fetch venue data
app.get("/api/venues-Details", async (req, res) => {
  const sqlQuery = `
SELECT
    v.id,
    v.name AS name,
    v.status,
    v.center_head AS "centerHead",
    v.address,
    v.google_url AS "googleMapsUrl",
    ts.id AS "timeslotId",
    ts.start_time AS "startTime",
    ts.end_time AS "endTime",
    d.day AS day
FROM cd.venues_data v
LEFT JOIN cd.venuetime_slots ts
    ON ts.venue_id = v.id
LEFT JOIN cd.venuetimeslot_days d
    ON d.time_slot_id = ts.id
WHERE v.active = true
ORDER BY v.id, ts.id, d.day;
`.trim();

  try {
    const result = await pool.query(sqlQuery);
    const structuredData = formatVenueData(result.rows);

    res.status(200).json(structuredData);
  } catch (err) {
    console.error("Database query error:", err);
    res
      .status(500)
      .json({ error: "Failed to retrieve venue data.", details: err.message });
  }
});

///venus add the route here
app.post("/api/venue-data/add", async (req, res) => {
  // 🐛 FIX 1: Destructure googleUrl from req.body. 
  // It is used in the query but was not destructured from the request body.
  const { name, centerHead, address, active = true, timeSlots, googleUrl } = req.body;

  if (
    !name ||
    !centerHead ||
    !address ||
    !timeSlots ||
    timeSlots.length === 0
  ) {
    return res
      .status(400)
      .json({ error: "Missing venue details or time slot data." });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const venueQuery = `
        INSERT INTO cd.venues_data
        (name, center_head, address, active, google_url)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id;
    `;
    const venueValues = [name, centerHead, address, active, googleUrl || null];
    const venueResult = await client.query(venueQuery, venueValues);
    const venue_id = venueResult.rows[0].id;

    const insertedSlots = [];

    for (const slot of timeSlots) {
      const timeSlotQuery = `
          INSERT INTO cd.venuetime_slots
          (venue_id, start_time, end_time, active)
          VALUES ($1, $2, $3, $4)
          RETURNING id;
      `;
      const timeSlotValues = [
        venue_id,
        slot.startTime,
        slot.endTime,
        slot.active || true,
      ];
      const timeSlotResult = await client.query(timeSlotQuery, timeSlotValues);
      const time_slot_id = timeSlotResult.rows[0].id;

      if (slot.days && slot.days.length > 0) {
        for (const day of slot.days) {
          const dayQuery = `
              INSERT INTO cd.venuetimeslot_days
              (time_slot_id, day, active)
              VALUES ($1, $2, $3)
              RETURNING id;
          `;
          // 🐛 FIX 3: Use the slot's 'active' status for the day, or default to true. 
          // The original code used 'slot.active || true' for both timeSlotValues and dayValues.
          // This is generally acceptable, but passing the same calculated 'active' status for consistency is better.
          // Note: Assuming 'day' is a simple value (e.g., string/integer representing a day).
          const dayValues = [time_slot_id, day, slot.active || true];
          await client.query(dayQuery, dayValues);
        }
      }
      insertedSlots.push({ slot_id: time_slot_id, startTime: slot.startTime });
    }

    await client.query("COMMIT");

    res.status(201).json({
      message: "Venue and all associated time slots added successfully.",
      venue_id: venue_id,
      time_slots_inserted: insertedSlots.length,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Transactional Venue Insert Error:", err);
    res.status(500).json({
      error: "Failed to complete venue insertion transaction.",
      details: err.message,
    });
  } finally {
    client.release();
  }
});

//delete venue route
// server.js (or wherever your route lives)
app.delete("/api/venues-delete/:id", async (req, res) => {
  const venueId = Number(req.params.id);
  if (!Number.isInteger(venueId) || venueId <= 0) {
    return res.status(400).json({ error: "Invalid venue ID provided." });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // FIXED — changed venue_id → venueid (or your real FK)
    const deleteDaysQuery = `
      UPDATE cd.venuetimeslot_days
      SET active = false,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;
    const resultDays = await client.query(deleteDaysQuery, [venueId]);

    const deleteSlotsQuery = `
      UPDATE cd.venuetime_slots
      SET active = false,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;
    const resultSlots = await client.query(deleteSlotsQuery, [venueId]);

    const deleteVenueQuery = `
      UPDATE cd.venues_data
      SET active = false,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;
    const resultVenue = await client.query(deleteVenueQuery, [venueId]);

    if (resultVenue.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: `Venue with ID ${venueId} not found.` });
    }

    await client.query("COMMIT");
    res.status(200).json({
      message: `Venue ID ${venueId} and related data deactivated successfully.`,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Venue deletion failed:", err.stack);
    res.status(500).json({ error: "Failed to delete venue due to a server or database error." });
  } finally {
    client.release();
  }
});



//Start this serever coach details and Database dashboard working fine
// The SQL Query Constant
const sql = (strings, ...values) => {
    let query = strings.reduce((acc, str, i) => acc + str + (values[i] !== undefined ? values[i] : ''), '');
    query = query.trim();
    const lines = query.split('\n').map(line => line.trim());
    return lines.filter(line => line.length > 0).join(' ');
};

app.get("/api/coach-data", authenticateToken, async (req, res) => {
  // 1. Authorization Check: Ensure only coaches can access this route.
  if (req.user.role !== "coach") {
    return res.status(403).json({ error: "Access denied. Only coaches can view this data." });
  }

  // 2. Identify the user by their authenticated email.
  const coachEmail = req.user.email;
  
  if (!coachEmail) {
    return res.status(400).json({ error: "Authenticated user email is missing." });
  }

  try {
    // Using the 'sql' template tag to safely format and clean the query string
    const queryString = sql`
SELECT 
    p.player_id AS id,
    p.name,
    p.age,
    p.category,
    p.status,
    ROUND(
        (SUM(CASE WHEN a.is_present = TRUE THEN 1 ELSE 0 END) * 100.0)
        / NULLIF(COUNT(a.attendance_id), 0),
        2
    ) AS attendance
FROM cd.player_details p
LEFT JOIN cd.attendance_sheet a ON p.player_id = a.player_id
INNER JOIN cd.coaches_details c ON p.coach_id = c.coach_id
INNER JOIN cd.users_login u ON c.email = u.email
WHERE
    u.email = $1
    AND u.role = 'coach'
    AND p.active = TRUE
GROUP BY
    p.player_id, p.name, p.age, p.category, p.status
ORDER BY
    p.name;
    `;

    const result = await pool.query(
      queryString,
      [coachEmail]
    );

    // Return the structured response
    res.json({
      coach_email: coachEmail,
      players: result.rows,
    });
  } catch (err) {
    console.error("Error executing coach data query:", err.stack);
    res
      .status(500)
      .json({ error: "Internal server error while fetching player data." });
  }
});
// ---------------------------------------------
// Attendance Recording Endpoint
// ---------------------------------------------
app.post("/api/attendance", async (req, res) => {
  const { playerId, attendanceDate, isPresent, coachId } = req.body;
  if (!playerId || !attendanceDate || isPresent === undefined || !coachId) {
    return res.status(400).json({ error: "Missing required attendance data." });
  }
  const queryText = `
    INSERT INTO cd.attendance_sheet 
    (player_id, attendance_date, is_present, recorded_by_coach_id)
    VALUES($1, $2, $3, $4)
    RETURNING *;
  `;

  const queryValues = [playerId, attendanceDate, isPresent, coachId];
  try {
    const result = await pool.query(queryText, queryValues);
    res.status(201).json({
      message: "Attendance successfully recorded.",
      data: result.rows[0],
    });
  } catch (err) {
    console.error("Error executing query", err.stack);
    res.status(500).json({
      error: "Failed to record attendance due to server error.",
      details: err.message,
    });
  }
});

// ---------------------------------------------
//Fetches player details, attendance percentage, and recent activities for a player guardian
app.get("/api/player-details/:email", authenticateToken, async (req, res) => {
  const parentEmail = req.params.email;

  // Authorization Check:
  if (req.user.role !== "parent" || req.user.email !== parentEmail) {
    return res
      .status(403)
      .json({
        error: "Forbidden: Token role or email does not match requested data.",
      });
  }

  if (!parentEmail) {
    return res.status(400).json({ error: "Missing parent email parameter." });
  }

  try {
    const sqlQuery = `
            SELECT
                pd.player_id,
                pd.name,
                pd.age,
                pd.center_name AS center,
                pd.coach_name AS coach,
                pd.category as position,
                pd.phone_no,
                pd.email_id AS player_email,
                COALESCE(
                    CAST(SUM(CASE WHEN a.is_present = TRUE THEN 1 ELSE 0 END) AS NUMERIC) * 100 /
                    NULLIF(COUNT(a.attendance_id), 0),
                    0
                ) AS attendance_percentage,
                (
                    SELECT json_agg(
                        json_build_object(
                            'date', a_recent.attendance_date,
                            'activity', 'Training Session',
                            'status', CASE WHEN a_recent.is_present THEN 'Present' ELSE 'Absent' END
                        )
                        ORDER BY a_recent.attendance_date DESC
                       
                    )
                    FROM cd.attendance_sheet a_recent
                    WHERE a_recent.player_id = pd.player_id
                ) AS recent_activities_json
            FROM
                cd.player_details pd
            LEFT JOIN
                cd.attendance_sheet a ON pd.player_id = a.player_id
            INNER JOIN
                cd.users_login ul ON ul.email = pd.guardian_email_id
            WHERE
                -- FIX: Use LOWER(TRIM()) for robust case-insensitive, whitespace-safe comparison
                LOWER(TRIM(ul.email)) = LOWER(TRIM($1)) 
                AND ul.role = 'parent'
            GROUP BY
                pd.player_id, pd.name, pd.age, pd.center_name, pd.coach_name, pd.category, pd.phone_no, pd.email_id;
        `;

    const result = await pool.query(sqlQuery, [parentEmail]);

    // Returns empty array if no players found. Frontend handles this state.
    res.json(result.rows);
  } catch (err) {
    console.error("Error executing query:", err.stack);
    res
      .status(500)
      .json({ error: "Internal server error while fetching player data." });
  }
});

app.use(express.json());

//fech data registrations API and code
app.get('/api/registrations', async (req, res) => {
  const sqlQuery = `
    SELECT
      regist_id,
      name,
      phone_number,
      email_id,
      address,
      age,
      application_date,
      parent_name,
      Status,
      active
    FROM cd.registrations_details
    ORDER BY regist_id DESC;
  `;

  try {
    const client = await pool.connect();
    const result = await client.query(sqlQuery);
    client.release();

    res.status(200).json({
      success: true,
      data: result.rows,
      count: result.rowCount
    });

  } catch (err) {
    console.error("Error executing query:", err);
    res.status(500).json({ error: "Database query failed." });
  }
});

//Endpoint for Bulk Uploading New Registrations from Excel
app.post('/api/registrations/bulk-upload', async (req, res) => {
    const registrations = req.body;

    if (!Array.isArray(registrations) || registrations.length === 0) {
        return res.status(400).json({ error: 'Invalid or empty array' });
    }

    // --- DEBUGGING LOG ---
    console.log(`Received ${registrations.length} registrations for bulk upload.`);
    // ---------------------

    const columns = [
        "name",
        "phone_number",
        "email_id",
        "address",
        "age",
        "application_date",
        "parent_name"
    ];

    const values = [];
    const placeholders = registrations.map((reg, index) => {
        const base = index * columns.length + 1;

        // Ensure explicit handling of nulls for database
        values.push(
            reg.name || null,
            reg.phone_number || null,
            reg.email_id || null, 
            reg.address || null,
            reg.age !== undefined && reg.age !== null ? reg.age : null, // Age can be 0, so check for undefined/null
            reg.application_date || null,
            reg.parent_name || null
        );

        return `(${columns.map((_, i) => `$${base + i}`).join(",")})`;
    }).join(",");

    const sql = `
        INSERT INTO cd.registrations_details
        (${columns.join(",")})
        VALUES ${placeholders}
        ON CONFLICT (email_id) DO NOTHING
        RETURNING *;
    `;
    
    // --- DEBUGGING LOG ---
    console.log("Generated SQL (Snippet):", sql.substring(0, 100) + '...');
    // ---------------------

    try {
        const result = await pool.query(sql, values);
        
        // --- DEBUGGING LOG ---
        console.log(`Database query successful. Inserted: ${result.rowCount} rows.`);
        // ---------------------

        return res.status(201).json({
            success: true,
            inserted: result.rowCount,
            totalRecordsAttempted: registrations.length, // Added for better client feedback
            newRecords: result.rows
        });
    } catch (err) {
        // --- CRITICAL ERROR LOG ---
        console.error("!!! DB ERROR (Bulk Insert Failed) !!!", err);
        // --------------------------
        return res.status(500).json({
            error: "Database insert failed",
            details: err.message
        });
    }
});


//updated the reaject and approved Registrations Excell
app.put('/api/registrations/status/:id', async (req, res) => {  
    const { id } = req.params;
    const { status } = req.body; 

    if (!status || !id) {
        return res.status(400).json({ error: "Missing required fields: status or registration ID." });
    }

    const sqlQuery = `
      UPDATE cd.registrations_details 
      SET Status = $1 
      WHERE regist_id = $2
    `;
    const values = [status, id];

    try {
        const client = await pool.connect();
        const result = await client.query(sqlQuery, values);
        client.release();

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: `Registration with ID ${id} not found.` });
        }

        res.status(200).json({ 
            success: true, 
            message: `Registration ${id} status updated to ${status}.` 
        });

    } catch (err) {
        console.error("Error executing PUT query:", err);
        res.status(500).json({ error: "Database update failed." });
    }
});

//Delete the Registrations Serever.js and API 
app.put('/api/registrations/reject', async (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Registration ID (id) is required.' });
  }

  try {
    const queryText = `
      UPDATE cd.registrations_details
      SET active = false, Status = 'Rejected'
      WHERE regist_id = $1
      RETURNING *;
    `;

    const result = await pool.query(queryText, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: `Registration with ID ${id} not found.` });
    }

    res.status(200).json({
      message: 'Registration successfully rejected.',
      rejectedRegistration: result.rows[0]
    });

  } catch (error) {
    console.error('Error rejecting registration:', error.stack);
    res.status(500).json({ error: 'Failed to reject registration due to a server error.' });
  }
});

// ---------------------------------------------
// START SERVER
// ---------------------------------------------
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}.`);
    console.log(`DB Host is: ${process.env.POR}`);
});

