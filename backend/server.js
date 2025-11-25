/**
 * You must create a .env file in your root directory with these variables:
 *
 * .env content example:
 * NODE_ENV=development
 * PORT=5000
 * DB_USER=postgres
 * DB_HOST=localhost
 * DB_DATABASE=admincomdata
 * DB_PASSWORD=Admin@123
 * DB_PORT=5432
 * JWT_SECRET=YOUR_VERY_STRONG_SECRET_KEY
 * * NOTE: For deployment (e.g., Render/Vercel), you must update these
 * variables in the platform's settings.
 */

import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import pg from "pg";
import multer from "multer";
import path from "path";
import fs from "fs";
import jwt from "jsonwebtoken";

// For production-ready code, you should use dotenv to load environment variables
// from a .env file locally.
// import dotenv from 'dotenv';
// dotenv.config(); 
// The code below assumes process.env variables are set.

const { Pool } = pg;
const app = express();

const PORT = process.env.PORT || 5000;

// ---------------------------------------------
// SECURE DB CONNECTION
// ---------------------------------------------
const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_DATABASE || "admincomdata",
  password: process.env.DB_PASSWORD || "Admin@123", // **MUST BE SECURED**
  port: process.env.DB_PORT || 5432,
  // Add SSL connection options for production environments like Render/Heroku
  // ssl: { rejectUnauthorized: false } 
});

// ---------------------------------------------
// CONFIGURATION & MIDDLEWARE
// ---------------------------------------------
const JWT_SECRET = process.env.JWT_SECRET || "SECRET_KEY"; // **MUST BE SECURED**

// Use express.json() for parsing application/json. THIS IS CRUCIAL.
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));

// Configure CORS
const allowedOrigins = [
    "http://localhost:3000", 
    "http://localhost:8080"
];

app.use(
  cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true); 
        if (allowedOrigins.indexOf(origin) === -1) {
          const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
          return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);


// ---------------------------------------------
// CREATE UPLOADS FOLDER & SERVE STATIC FILES
// ---------------------------------------------
const UPLOAD_DIR = path.resolve("uploads");

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  console.log("✔ Uploads folder created:", UPLOAD_DIR);
}

app.use("/uploads", express.static(UPLOAD_DIR));

// ---------------------------------------------
// MULTER STORAGE CONFIGURATION
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

const upload = multer({ 
    storage,
    limits: { fileSize: 1024 * 1024 * 5 }, // Limit file size to 5MB
}).fields([
  { name: "profile_photo_path", maxCount: 1 },
  { name: "aadhar_upload_path", maxCount: 1 },
  { name: "birth_certificate_path", maxCount: 1 },
]);

// ---------------------------------------------
// JWT AUTHENTICATION MIDDLEWARE
// ---------------------------------------------
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (token == null)
    return res.status(401).json({ error: "Access Denied: No Token Provided" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      // Log for debugging: console.error("JWT Verification Error:", err.message);
      // This covers expired tokens, invalid signatures, etc.
      return res.status(403).json({ error: "Access Denied: Invalid or Expired Token" }); 
    }
    req.user = user;
    next();
  });
};

// ---------------------------------------------
// SIGNUP
// ---------------------------------------------
app.post("/auth/login", async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password || !role) {
      return res.status(400).json({ error: "All fields are required." });
    }

    const result = await pool.query(
      `SELECT * FROM cd.users_login 
       WHERE email = $1 AND password = $2 AND role = $3 AND active = TRUE 
       LIMIT 1`,
      [email, password, role]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    const user = result.rows[0];

    res.status(200).json({
      message: "Login successful",
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      token: "NO_JWT_YET", // Add JWT later if needed
    });
  } catch (err) {
    console.log("❌ Login API Error:", err);
    res.status(500).json({ error: "Server Error During Login" });
  }
});
// ---------------------------------------------
// LOGIN (CORRECT ENDPOINT: /api/login)
// ---------------------------------------------
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
    
    // Generate JWT
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
// PLAYER ROUTES
// ---------------------------------------------

// GET PLAYERS
app.get("/api/players-details", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, player_id, name, age, address, phone_no, center_name, coach_name, category, status
      FROM cd.player_details 
      ORDER BY id DESC;
    `);

    res.json(result.rows);
  } catch(error) {
    console.error("Error fetching player details:", error);
    res.status(500).json({ error: "Fetch failed" });
  }
});

// ADD PLAYER (Handles file upload)
app.post("/api/players-add", (req, res) => {
  upload(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: `File upload failed: ${err.code}` });
    }
    if (err) {
      console.log("❌ Multer upload error:", err);
      return res.status(500).json({ error: "File upload failed" });
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

    // Check for mandatory fields before DB insert
    if (!data.name || !data.email_id || !data.phone_no) {
        return res.status(400).json({ error: "Missing mandatory fields (name, email_id, phone_no)." });
    }

    try {
      const query = `
        INSERT INTO cd.player_details (
          name, age, address, father_name, mother_name, gender, 
          date_of_birth, blood_group, email_id, emergency_contact_number, 
          guardian_contact_number, guardian_email_id, medical_condition, 
          aadhar_upload_path, birth_certificate_path, profile_photo_path, phone_no,
          active, status
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17, TRUE, 'Active'
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
      
      if (error.code === "23505") { // Unique constraint violation
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

// GET Player for EDIT (FIXED: uses client/finally for better connection management)
app.get("/api/Player-edit", async (req, res) => {
  let client;
  try {
    const { id, player_id } = req.query;

    if (!id || !player_id) {
      return res
        .status(400)
        .json({ error: "Missing required parameters: id and player_id" });
    }

    client = await pool.connect();
    const queryText = `
            SELECT 
                id, player_id, name, age, address, center_name, coach_name,
                category, active, status, father_name, mother_name, gender,
                date_of_birth, blood_group, email_id, emergency_contact_number,
                guardian_contact_number, guardian_email_id, medical_condition,
                aadhar_upload_path, birth_certificate_path, profile_photo_path, phone_no
            FROM 
                cd.player_details 
            WHERE 
                id = $1 
                AND player_id = $2;
        `;

    const result = await client.query(queryText, [id, player_id]);

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Player details not found for the given IDs." });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching player details:", error);
    res.status(500).json({
      error: "Internal Server Error",
      details: error.message,
    });
  } finally {
    if (client) {
      client.release();
    }
  }
});

// UPDATE PLAYER
app.put("/api/Player-Edit/:id", async (req, res) => {
  try {
    const playerIdFromUrl = req.params.id; // This should be 'id' column if the route is /:id
    const {
      name, age, address, center_name, coach_name, category, active, status,
      father_name, mother_name, gender, date_of_birth, blood_group, email_id,
      emergency_contact_number, guardian_contact_number, guardian_email_id,
      medical_condition, aadhar_upload_path, birth_certificate_path,
      profile_photo_path, phone_no, // NOTE: player_id is not included, as we update by it
    } = req.body;

    if (!playerIdFromUrl) {
      return res.status(400).json({ error: "Missing player ID in URL." });
    }
    
    // Simple check to ensure *some* data is being updated
    if (Object.keys(req.body).length === 0) {
        return res.status(400).json({ error: "No fields provided to update." });
    }


    const activeBool = 
      (active === true || active === "true" || active === 1) ? true : false;
    
    // Correctly format Date if provided
    const dob = date_of_birth 
        ? new Date(date_of_birth).toISOString().split("T")[0] 
        : null;

    const sql = `
      UPDATE cd.player_details
      SET
        name = COALESCE($1, name), age = COALESCE($2, age), address = COALESCE($3, address),
        center_name = COALESCE($4, center_name), coach_name = COALESCE($5, coach_name),
        category = COALESCE($6, category), active = COALESCE($7, active), status = COALESCE($8, status),
        father_name = COALESCE($9, father_name), mother_name = COALESCE($10, mother_name),
        gender = COALESCE($11, gender), date_of_birth = COALESCE($12, date_of_birth),
        blood_group = COALESCE($13, blood_group), email_id = COALESCE($14, email_id),
        emergency_contact_number = COALESCE($15, emergency_contact_number),
        guardian_contact_number = COALESCE($16, guardian_contact_number),
        guardian_email_id = COALESCE($17, guardian_email_id),
        medical_condition = COALESCE($18, medical_condition),
        aadhar_upload_path = COALESCE($19, aadhar_upload_path),
        birth_certificate_path = COALESCE($20, birth_certificate_path),
        profile_photo_path = COALESCE($21, profile_photo_path),
        phone_no = COALESCE($22, phone_no)
      WHERE player_id = $23
    `;

    // Reverting to the old logic since COALESCE would require complex logic 
    // to determine if a value was intentionally set to null or not provided.
    // Assuming all fields are provided for a full update, as in the original code.

    const updateSql = `
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
    // NOTE: This approach requires the client to send *all* fields, even if unchanged.

    const values = [
      name ?? null, age ?? null, address ?? null, center_name ?? null, coach_name ?? null,
      category ?? null, activeBool, status ?? null, father_name ?? null,
      mother_name ?? null, gender ?? null, dob, blood_group ?? null,
      email_id ?? null, emergency_contact_number ?? null,
      guardian_contact_number ?? null, guardian_email_id ?? null,
      medical_condition ?? null, aadhar_upload_path ?? null,
      birth_certificate_path ?? null, profile_photo_path ?? null,
      phone_no ?? null, playerIdFromUrl,
    ];

    const result = await pool.query(updateSql, values);

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
    return res.status(500).json({
      error: "Failed to update player details",
      details: err.message || String(err),
    });
  }
});

// DELETE Route (Deactivate Player)
app.delete("/api/Player-Delete/:id", async (req, res) => {
  try {
    const playerIdFromUrl = req.params.id; // This is the 'id' column, not player_id

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

// ---------------------------------------------
// COACH ROUTES
// ---------------------------------------------

// POST Route for adding a new coach (INSERT)
app.post("/api/coaches-add", async (req, res) => {
  try {
    const {
      coach_name, phone_numbers, email, address, players = 0, salary,
      attendance, week_salary = 0, category = "Other", active = true, status = "Active",
    } = req.body;

    const numericSalary = Number(salary);
    if ( !coach_name || !email || !salary || isNaN(numericSalary) || numericSalary < 0 ) {
      return res.status(400).json({
        error: "Missing or invalid required fields (name, email, salary must be positive number).",
      });
    }

    const numericWeekSalary = Number(week_salary) || 0;
    const numericPlayers = Number(players) || 0;
    const isActive = active === true || active === "true" || active === 1;

    const sql = `
        INSERT INTO cd.coaches_details
            (coach_name, phone_numbers, email, address, players, salary, week_salary, category, active, status, attendance)
        VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING coach_id, coach_name; 
    `;

    const values = [
      coach_name, phone_numbers, email, address, numericPlayers,
      numericSalary, numericWeekSalary, category, isActive, status, attendance,
    ];

    const result = await pool.query(sql, values);

    res.status(201).json({
      message: "Coach successfully added.",
      coach: result.rows[0],
    });
  } catch (error) {
    if (error.code === "23505") { // Unique constraint violation (likely on email)
         return res.status(409).json({ error: "A coach with this email already exists." });
    }
    console.error("❌ Database insertion error for coach:", error.message);
    res.status(500).json({
      error: "Failed to add coach details due to a server error.",
      details: error.message,
    });
  }
});

// GET Coach List for Player Assignment Dropdown
app.get("/api/coaches-list", async (req, res) => {
  const sqlQuery = `SELECT coach_id, coach_name, category FROM cd.coaches_details WHERE active = TRUE ORDER BY coach_id ASC`;

  try {
    const result = await pool.query(sqlQuery);
    return res.json(result.rows);
  } catch (err) {
    console.error("Error executing query for coaches:", err.stack);
    return res.status(500).json({
      message: "Failed to fetch coach list from the database.",
      error: err.message,
    });
  }
});

// GET All Coach Details (Admin View)
app.get("/api/coach-details", async (req, res) => {
  try {
    const queryText = `
        SELECT coach_id, players, coach_name, phone_numbers, salary, email,
          address, attendance, week_salary, category, status, active
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

// UPDATE Coach Details
app.put("/api/coaches-update/:coach_id", async (req, res) => {
  try {
    const coachIdFromUrl = req.params.coach_id;
    const {
      coach_name, phone_numbers, email, address, salary,
      week_salary, active, status,
    } = req.body;

    const numericCoachId = Number(coachIdFromUrl);
    const numericSalary = Number(salary);

    if (
      isNaN(numericCoachId) || numericCoachId <= 0 ||
      !coach_name || !email || !salary || isNaN(numericSalary) || numericSalary < 0
    ) {
      return res.status(400).json({
        error: "Missing or invalid required fields (coach_id, name, email, salary must be valid).",
      });
    }

    const numericWeekSalary = Number(week_salary) || 0;
    const isActive = active === true || active === "true" || active === 1;

    const sql = `
        UPDATE cd.coaches_details
        SET 
          coach_name = $1, phone_numbers = $2, email = $3, address = $4,
          salary = $5, week_salary = $6, active = $7, status = $8
        WHERE coach_id = $9
        RETURNING "coach_id", "coach_name", "status";
      `;

    const values = [
      coach_name, phone_numbers, email, address, numericSalary,
      numericWeekSalary, isActive, status, numericCoachId, 
    ];

    const result = await pool.query(sql, values);

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: `Coach with ID ${coachIdFromUrl} not found.`,
      });
    }

    res.status(200).json({
      message: "Coach successfully updated.",
      coach: result.rows[0],
    });
  } catch (error) {
    console.error("❌ Database update error for coach:", error.message);
    res.status(500).json({
      error: "Failed to update coach details due to a server error.",
      details: error.message,
    });
  }
});

// DEACTIVATE Coach (Soft Delete)
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

    const result = await pool.query(sql, [numericCoachId]);

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

// ---------------------------------------------
// PLAYER ASSIGNMENT ROUTES
// ---------------------------------------------

// Fetch players for assignment view
app.get("/api/players-agssign", async (req, res) => {
  try {
    const result = await pool.query(`
        SELECT player_id, id, name, category, coach_name, coach_id  
        FROM cd.player_details 
        WHERE active = TRUE
        ORDER BY player_id, id asc;
      `);

    const players = result.rows.map((row) => ({
      id: row.id,
      player_id: row.player_id,
      name: row.name,
      coachId: row.coach_id,
      category: row.category,
      coach_name: row.coach_name,
    }));

    res.json({
      status: "success",
      count: players.length,
      players: players,
    });
  } catch (error) {
    console.error("Error executing players-agssign query:", error.stack);
    res.status(500).json({
      status: "error",
      message: "Failed to retrieve player data from the database.",
      details: error.message,
    });
  }
});

// Update the assigned coach to player
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

  const values = [coach_name, coach_id, player_id, id];

  try {
    const result = await pool.query(sqlQuery, values);

    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ message: "No record found matching the criteria for update." });
    }

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

// ---------------------------------------------
// VENUE ROUTES
// ---------------------------------------------

// Helper function to format venue data (kept as is, it's good logic)
const formatVenueData = (rows) => {
    const venuesMap = new Map();

    rows.forEach(row => {
        const { id, name, centerHead, address, googleMapsUrl,
            timeslotId, startTime, endTime, day
        } = row;

        if (!venuesMap.has(id)) {
            venuesMap.set(id, {
                id,
                name,
                centerHead,
                address,
                googleMapsUrl,
                operatingHours: [],
            });
        }

        const venue = venuesMap.get(id);

        if (timeslotId && startTime && endTime && day) {
            
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

    return Array.from(venuesMap.values());
};

// Fetch venue data
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

// Add new venue and time slots (Transactional)
app.post("/api/venue-data/add", async (req, res) => {
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
    // googleUrl || null handles an undefined or empty string googleUrl
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
      const slotActive = slot.active || true;
      const timeSlotValues = [
        venue_id,
        slot.startTime,
        slot.endTime,
        slotActive,
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
          const dayValues = [time_slot_id, day, slotActive];
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

// Deactivate venue and related data (Transactional)
app.delete("/api/venues-delete/:id", async (req, res) => {
  const venueId = Number(req.params.id);
  if (!Number.isInteger(venueId) || venueId <= 0) {
    return res.status(400).json({ error: "Invalid venue ID provided." });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // FIX: Deactivate Time_slot_days related to the venue
    const deleteDaysQuery = `
      UPDATE cd.venuetimeslot_days
      SET active = false, updated_at = CURRENT_TIMESTAMP
      WHERE time_slot_id IN (SELECT id FROM cd.venuetime_slots WHERE venue_id = $1)
    `;
    await client.query(deleteDaysQuery, [venueId]);

    // FIX: Deactivate Time_slots related to the venue
    const deleteSlotsQuery = `
      UPDATE cd.venuetime_slots
      SET active = false, updated_at = CURRENT_TIMESTAMP
      WHERE venue_id = $1
    `;
    await client.query(deleteSlotsQuery, [venueId]);

    // Deactivate the main venue record
    const deleteVenueQuery = `
      UPDATE cd.venues_data
      SET active = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id;
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

// ---------------------------------------------
// COACH DASHBOARD (REQUIRES AUTH)
// ---------------------------------------------

// Helper function for cleaning SQL (Kept as is)
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
    const queryString = sql`
        SELECT 
            p.player_id AS id,
            p.name,
            p.age,
            p.category,
            p.status,
            ROUND(
                (SUM(CASE WHEN a.is_present = TRUE THEN 1 ELSE 0 END) * 100.0)
                / NULLIF(COUNT(DISTINCT a.attendance_date), 0),
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

// Attendance Recording Endpoint
app.post("/api/attendance", async (req, res) => {
  const { playerId, attendanceDate, isPresent, coachId } = req.body;
  
  if (!playerId || !attendanceDate || isPresent === undefined || !coachId) {
    return res.status(400).json({ error: "Missing required attendance data." });
  }
  
  const queryText = `
    INSERT INTO cd.attendance_sheet 
    (player_id, attendance_date, is_present, recorded_by_coach_id)
    VALUES($1, $2, $3, $4)
    ON CONFLICT (player_id, attendance_date) DO UPDATE
    SET is_present = $3, recorded_by_coach_id = $4
    RETURNING *;
  `; // Added ON CONFLICT to prevent duplicate attendance records for the same day

  const queryValues = [playerId, attendanceDate, isPresent, coachId];
  
  try {
    const result = await pool.query(queryText, queryValues);
    res.status(201).json({
      message: "Attendance successfully recorded.",
      data: result.rows[0],
    });
  } catch (err) {
    console.error("Error executing attendance query", err.stack);
    res.status(500).json({
      error: "Failed to record attendance due to server error.",
      details: err.message,
    });
  }
});


// ---------------------------------------------
// PARENT/GUARDIAN DASHBOARD (REQUIRES AUTH)
// ---------------------------------------------
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
                    NULLIF(COUNT(DISTINCT a.attendance_date), 0),
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
                        LIMIT 5 -- Limit recent activities for performance
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
                LOWER(TRIM(ul.email)) = LOWER(TRIM($1)) 
                AND ul.role = 'parent'
            GROUP BY
                pd.player_id, pd.name, pd.age, pd.center_name, pd.coach_name, pd.category, pd.phone_no, pd.email_id;
        `;

    const result = await pool.query(sqlQuery, [parentEmail]);

    res.json(result.rows);
  } catch (err) {
    console.error("Error executing guardian/parent query:", err.stack);
    res
      .status(500)
      .json({ error: "Internal server error while fetching player data." });
  }
});


// ---------------------------------------------
// REGISTRATION ROUTES
// ---------------------------------------------

// Fetch all registrations
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
    const result = await pool.query(sqlQuery);

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

// Endpoint for Bulk Uploading New Registrations from Excel
app.post('/api/registrations/bulk-upload', async (req, res) => {
    const registrations = req.body;

    if (!Array.isArray(registrations) || registrations.length === 0) {
        return res.status(400).json({ error: 'Invalid or empty array' });
    }

    const columns = [
        "name", "phone_number", "email_id", "address", "age", "application_date", "parent_name"
    ];

    const values = [];
    const placeholders = registrations.map((reg, index) => {
        const base = index * columns.length + 1;

        values.push(
            reg.name || null,
            reg.phone_number || null,
            reg.email_id || null, 
            reg.address || null,
            (reg.age !== undefined && reg.age !== null) ? reg.age : null,
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
    
    try {
        const result = await pool.query(sql, values);
        
        return res.status(201).json({
            success: true,
            inserted: result.rowCount,
            totalRecordsAttempted: registrations.length,
            newRecords: result.rows
        });
    } catch (err) {
        console.error("!!! DB ERROR (Bulk Insert Failed) !!!", err);
        return res.status(500).json({
            error: "Database insert failed",
            details: err.message
        });
    }
});


// Update registration status (Approved/Rejected)
app.put('/api/registrations/status/:id', async (req, res) => {  
    const { id } = req.params;
    const { status } = req.body; 

    if (!status || !id) {
        return res.status(400).json({ error: "Missing required fields: status or registration ID." });
    }
    
    // Ensure status is a valid option if necessary
    const validStatuses = ['Approved', 'Rejected', 'Pending']; 
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status value provided." });
    }


    const sqlQuery = `
      UPDATE cd.registrations_details 
      SET Status = $1 
      WHERE regist_id = $2
    `;
    const values = [status, id];

    try {
        const result = await pool.query(sqlQuery, values);

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

// Reject and Deactivate Registration (Soft Delete)
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
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
