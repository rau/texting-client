// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::fs;
use std::fmt;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

// Define structs for our data
#[derive(Serialize, Deserialize, Debug)]
pub struct Conversation {
    id: String,
    name: Option<String>,
    last_message: Option<String>,
    last_message_date: i64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Message {
    id: i64,
    text: String,
    date: i64,
    is_from_me: bool,
    chat_id: Option<String>, // Added for search results to know which chat a message belongs to
    sender_name: Option<String>, // Added to show who sent each message
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SearchResult {
    messages: Vec<Message>,
    total_count: usize,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ContactPhoto {
    full_photo: Option<String>,  // Changed from Vec<u8> to String to store base64 with data URL
    thumbnail: Option<String>,   // Changed from Vec<u8> to String
    legacy_photo: Option<String>, // Changed from Vec<u8> to String
}

impl ContactPhoto {
    fn is_valid_image_data(data: &[u8]) -> bool {
        if data.len() < 4 {
            return false;
        }
        
        // Check if it's an actual image (not a reference)
        if data[0] != 0x01 {
            return false;
        }
        
        // The actual image data starts after the first byte
        let image_data = &data[1..];
        
        // Check for JPEG magic bytes
        if image_data.starts_with(&[0xFF, 0xD8, 0xFF]) {
            return true;
        }
        
        // Check for PNG magic bytes
        if image_data.starts_with(&[0x89, 0x50, 0x4E]) {
            return true;
        }
        
        false
    }

    fn prepare_image_data(data: &[u8]) -> Option<String> {
        if data.len() < 4 {
            return None;
        }

        // Skip the first byte (0x01) to get raw image data
        let image_data = &data[1..];
        
        // Determine image format and create appropriate data URL
        let mime_type = if image_data.starts_with(&[0xFF, 0xD8, 0xFF]) {
            "image/jpeg"
        } else if image_data.starts_with(&[0x89, 0x50, 0x4E]) {
            "image/png"
        } else {
            return None;
        };

        // Create base64 string with data URL prefix
        let base64_str = BASE64.encode(image_data);
        Some(format!("data:{};base64,{}", mime_type, base64_str))
    }
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ContactInfo {
    contact_id: i64,
    first_name: Option<String>,
    last_name: Option<String>,
    nickname: Option<String>,
    organization: Option<String>,
    photo: Option<ContactPhoto>,
    emails: Vec<String>,
    phones: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ContactResponse {
    contacts: Vec<ContactInfo>,
}

#[derive(Debug)]
pub enum AppError {
    DatabaseNotFound,
    DatabaseConnectionError(rusqlite::Error),
    DatabaseQueryError(rusqlite::Error),
    IOError(std::io::Error),
    SerializationError(serde_json::Error),
    OtherError(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::DatabaseNotFound => write!(f, "iMessage database not found"),
            AppError::DatabaseConnectionError(e) => write!(f, "Database connection error: {}", e),
            AppError::DatabaseQueryError(e) => write!(f, "Database query error: {}", e),
            AppError::IOError(e) => write!(f, "IO error: {}", e),
            AppError::SerializationError(e) => write!(f, "Serialization error: {}", e),
            AppError::OtherError(s) => write!(f, "Other error: {}", s),
        }
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(error: rusqlite::Error) -> Self {
        AppError::DatabaseQueryError(error)
    }
}

impl From<std::io::Error> for AppError {
    fn from(error: std::io::Error) -> Self {
        AppError::IOError(error)
    }
}

impl From<serde_json::Error> for AppError {
    fn from(error: serde_json::Error) -> Self {
        AppError::SerializationError(error)
    }
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

fn get_imessage_db_path() -> Result<PathBuf, AppError> {
    // On macOS, the iMessage db is in ~/Library/Messages/chat.db
    let home = dirs::home_dir().ok_or(AppError::OtherError("Home directory not found".to_string()))?;
    let db_path = home.join("Library/Messages/chat.db");
    
    
    if !db_path.exists() {
        println!("Database file not found at {:?}", db_path);
        return Err(AppError::DatabaseNotFound);
    }
    
    
    // Check if we can read the database
    // If not, we'll need to copy it to a temporary location with proper permissions
    match Connection::open(&db_path) {
        Ok(_) => {
            Ok(db_path)
        },
        Err(_e) => {
            // Create a temporary copy we can read
            let temp_dir = std::env::temp_dir();
            let temp_db_path = temp_dir.join("imessage_temp.db");
            
            // Copy the file
            match fs::copy(&db_path, &temp_db_path) {
                Ok(_) => {
                    println!("Successfully copied database to temporary location");
                    Ok(temp_db_path)
                },
                Err(e) => {
                    println!("Failed to copy database: {:?}", e);
                    Err(AppError::IOError(e))
                }
            }
        }
    }
}

fn apple_time_to_unix(apple_time: i64) -> i64 {
    // Apple uses Jan 1, 2001 as its epoch
    // Unix epoch is Jan 1, 1970
    // The difference is 978307200 seconds
    apple_time + 978307200
}

// Function to find the AddressBook database
fn get_addressbook_db_path() -> Result<PathBuf, AppError> {
    // Check for the local AddressBook-v22.db file in the project root
    let current_dir = std::env::current_dir().map_err(AppError::IOError)?;
    
    // Try multiple potential locations
    let potential_paths = vec![
        // Current directory
        current_dir.join("AddressBook-v22.db"),
        // Parent directory (if running from src-tauri)
        current_dir.parent()
            .map(|p| p.join("AddressBook-v22.db"))
            .unwrap_or_else(|| PathBuf::from("../AddressBook-v22.db")),
        // Explicit paths for macOS
        PathBuf::from("/Users/raunak/Documents/texting-client/AddressBook-v22.db"),
        // Relative paths that might work
        PathBuf::from("./AddressBook-v22.db"),
        PathBuf::from("../AddressBook-v22.db"),
    ];
    
    // Try each potential path
    for path in &potential_paths {
        if path.exists() {
            return Ok(path.clone());
        }
    }
    
    // Fallback to the macOS locations if the local file doesn't exist
    let home = dirs::home_dir().ok_or(AppError::OtherError("Home directory not found".to_string()))?;
    
    // Try the direct path first (older macOS)
    let direct_path = home.join("Library/Application Support/AddressBook/AddressBook-v22.abcddb");
    if direct_path.exists() {
        // IMPORTANT: We're going to disable this path to force use of local file
        return Err(AppError::OtherError("System AddressBook path is disabled. Please use local file.".to_string()));
    }
    
    // Try the Sources directory (newer macOS)
    let sources_dir = home.join("Library/Application Support/AddressBook/Sources");
    if sources_dir.exists() {
        // Read all subdirectories in Sources (UUIDs)
        let entries = fs::read_dir(&sources_dir).map_err(AppError::IOError)?;
        
        // Check each UUID directory
        for entry in entries {
            let entry = entry.map_err(AppError::IOError)?;
            let path = entry.path();
            
            if path.is_dir() {
                // Look for AddressBook-v22.abcddb in this UUID directory
                let db_path = path.join("AddressBook-v22.abcddb");
                if db_path.exists() {
                    // IMPORTANT: We're going to disable this path to force use of local file
                    return Err(AppError::OtherError("System AddressBook path is disabled. Please use local file.".to_string()));
                }
            }
        }
    }
    
    Err(AppError::OtherError("AddressBook database not found. Please make sure AddressBook-v22.db exists in the project root directory.".to_string()))
}

// Read contacts from AddressBook database
#[tauri::command]
async fn read_contacts() -> Result<ContactResponse, AppError> {
    let db_path = match get_addressbook_db_path() {
        Ok(path) => path,
        Err(e) => {
            return Ok(ContactResponse {
                contacts: Vec::new(),
            });
        }
    };
    
    let conn = match Connection::open(&db_path) {
        Ok(conn) => conn,
        Err(e) => {
            return Ok(ContactResponse {
                contacts: Vec::new(),
            });
        }
    };
    
    let mut contact_count = 0;
    let mut email_count = 0;
    let mut phone_count = 0;
    let mut text_output = Vec::new();
    let mut contact_map: std::collections::HashMap<i64, ContactInfo> = std::collections::HashMap::new();
    
    // First query: Get basic contact information and photos from ZABCDRECORD
    let basic_query = r#"
        SELECT 
            Z_PK,
            ZFIRSTNAME,
            ZLASTNAME,
            ZNICKNAME,
            ZORGANIZATION,
            ZIMAGEDATA,
            ZTHUMBNAILIMAGEDATA
        FROM 
            ZABCDRECORD
        WHERE 
            ZFIRSTNAME IS NOT NULL OR 
            ZLASTNAME IS NOT NULL OR 
            ZORGANIZATION IS NOT NULL OR
            ZNICKNAME IS NOT NULL OR
            ZIMAGEDATA IS NOT NULL OR
            ZTHUMBNAILIMAGEDATA IS NOT NULL
        LIMIT 1000
    "#;
    
    match conn.prepare(basic_query) {
        Ok(mut stmt) => {
            let rows = stmt.query_map([], |row| {
                let id: i64 = row.get(0)?;
                let first_name: Option<String> = row.get(1)?;
                let last_name: Option<String> = row.get(2)?;
                let nickname: Option<String> = row.get(3)?;
                let organization: Option<String> = row.get(4)?;
                let full_photo: Option<Vec<u8>> = row.get(5)?;
                let thumbnail: Option<Vec<u8>> = row.get(6)?;
                
                let name_parts = vec![
                    first_name.as_deref(), 
                    last_name.as_deref(),
                    nickname.as_deref(),
                    organization.as_deref()
                ];
                
                let full_name = name_parts
                    .into_iter()
                    .filter_map(|p| p)
                    .collect::<Vec<_>>()
                    .join(" ");
                
                let photo_info = if let Some(ref full_data) = full_photo {
                    let valid_full = ContactPhoto::is_valid_image_data(full_data);
                    let valid_thumb = thumbnail
                        .as_ref()
                        .map(|t| ContactPhoto::is_valid_image_data(t))
                        .unwrap_or(false);
                    
                    if valid_full || valid_thumb {
                        let photo_data = ContactPhoto {
                            full_photo: if valid_full { 
                                ContactPhoto::prepare_image_data(full_data)
                            } else { 
                                None 
                            },
                            thumbnail: if valid_thumb { 
                                thumbnail.as_ref().and_then(|t| ContactPhoto::prepare_image_data(t))
                            } else { 
                                None 
                            },
                            legacy_photo: None,
                        };
                        
                        // Store in contact_map
                        contact_map.entry(id).or_insert(ContactInfo {
                            contact_id: id,
                            first_name: first_name.clone(),
                            last_name: last_name.clone(),
                            nickname: nickname.clone(),
                            organization: organization.clone(),
                            photo: Some(photo_data),
                            emails: Vec::new(),
                            phones: Vec::new(),
                        });
                        
                        format!(", Has Photo: yes")
                    } else {
                        // Store in contact_map without photo since neither is valid image data
                        contact_map.entry(id).or_insert(ContactInfo {
                            contact_id: id,
                            first_name: first_name.clone(),
                            last_name: last_name.clone(),
                            nickname: nickname.clone(),
                            organization: organization.clone(),
                            photo: None,
                            emails: Vec::new(),
                            phones: Vec::new(),
                        });
                        
                        format!(", Has Photo: no (reference only)")
                    }
                } else {
                    // Store in contact_map without photo
                    contact_map.entry(id).or_insert(ContactInfo {
                        contact_id: id,
                        first_name: first_name.clone(),
                        last_name: last_name.clone(),
                        nickname: nickname.clone(),
                        organization: organization.clone(),
                        photo: None,
                        emails: Vec::new(),
                        phones: Vec::new(),
                    });
                    
                    format!(", Has Photo: no")
                };
                
                let contact_info = if full_name.is_empty() {
                    format!("Contact [ID: {}]: <No Name>{}", id, photo_info)
                } else {
                    format!("Contact [ID: {}]: {}{}", id, full_name, photo_info)
                };
                
                contact_count += 1;
                
                Ok(contact_info)
            });
            
            match rows {
                Ok(rows) => {
                    for row in rows {
                        if let Ok(contact) = row {
                            text_output.push(contact);
                        }
                    }
                },
                Err(_) => {}
            }
        },
        Err(_) => {}
    }
    
    // Also check for legacy photos in ZABCDLIKENESS
    let legacy_query = r#"
        SELECT 
            l.ZOWNER as contact_id,
            l.ZDATA as legacy_photo
        FROM 
            ZABCDLIKENESS l
        WHERE 
            l.ZDATA IS NOT NULL
        LIMIT 1000
    "#;
    
    match conn.prepare(legacy_query) {
        Ok(mut stmt) => {
            let rows = stmt.query_map([], |row| {
                let id: i64 = row.get(0)?;
                let legacy_photo: Option<Vec<u8>> = row.get(1)?;
                
                // Update contact_map with legacy photo
                if let Some(contact) = contact_map.get_mut(&id) {
                    if let Some(photo) = &mut contact.photo {
                        photo.legacy_photo = legacy_photo.map(|data| ContactPhoto::prepare_image_data(&data).unwrap_or_default());
                    } else {
                        contact.photo = Some(ContactPhoto {
                            full_photo: None,
                            thumbnail: None,
                            legacy_photo: legacy_photo.map(|data| ContactPhoto::prepare_image_data(&data).unwrap_or_default()),
                        });
                    }
                }
                
                let contact_info = format!("Contact [ID: {}]: Has Legacy Photo", id);
                Ok(contact_info)
            });
            
            match rows {
                Ok(rows) => {
                    for row in rows {
                        if let Ok(contact) = row {
                            text_output.push(contact);
                        }
                    }
                },
                Err(_) => {}
            }
        },
        Err(_) => {}
    }
    
    // Second query: Get email addresses joined with contact IDs
    let email_query = r#"
        SELECT 
            r.Z_PK as contact_id,
            COALESCE(r.ZFIRSTNAME, '') || ' ' || COALESCE(r.ZLASTNAME, '') as name,
            e.ZADDRESS as email
        FROM 
            ZABCDRECORD r
        JOIN
            ZABCDEMAILADDRESS e ON r.Z_PK = e.ZOWNER
        WHERE
            e.ZADDRESS IS NOT NULL
        LIMIT 1000
    "#;
    
    match conn.prepare(email_query) {
        Ok(mut stmt) => {
            let rows = stmt.query_map([], |row| {
                let contact_id: i64 = row.get(0)?;
                let name: String = row.get(1)?;
                let email: String = row.get(2)?;
                
                // Update contact_map with email
                if let Some(contact) = contact_map.get_mut(&contact_id) {
                    contact.emails.push(email.clone());
                }
                
                let contact_info = format!(
                    "Email [ID: {}] {}: {}", 
                    contact_id, 
                    if name.trim().is_empty() { "<No Name>" } else { &name.trim() },
                    email
                );
                
                email_count += 1;
                
                Ok(contact_info)
            });
            
            match rows {
                Ok(rows) => {
                    for row in rows {
                        if let Ok(contact) = row {
                            text_output.push(contact);
                        }
                    }
                },
                Err(_) => {}
            }
        },
        Err(_) => {}
    }
    
    // Third query: Get phone numbers joined with contact IDs
    let phone_query = r#"
        SELECT 
            r.Z_PK as contact_id,
            COALESCE(r.ZFIRSTNAME, '') || ' ' || COALESCE(r.ZLASTNAME, '') as name,
            p.ZFULLNUMBER as phone
        FROM 
            ZABCDRECORD r
        JOIN
            ZABCDPHONENUMBER p ON r.Z_PK = p.ZOWNER
        WHERE
            p.ZFULLNUMBER IS NOT NULL
        LIMIT 1000
    "#;
    
    match conn.prepare(phone_query) {
        Ok(mut stmt) => {
            let rows = stmt.query_map([], |row| {
                let contact_id: i64 = row.get(0)?;
                let name: String = row.get(1)?;
                let phone: String = row.get(2)?;
                
                // Strip out anything that's not a number from the phone
                let clean_phone: String = phone.chars()
                    .filter(|c| c.is_ascii_digit())
                    .collect();
                
                // Update contact_map with phone
                if let Some(contact) = contact_map.get_mut(&contact_id) {
                    contact.phones.push(clean_phone.clone());
                }
                
                let contact_info = format!(
                    "Phone [ID: {}] {}: {}", 
                    contact_id, 
                    if name.trim().is_empty() { "<No Name>" } else { &name.trim() },
                    clean_phone
                );
                
                phone_count += 1;
                
                Ok(contact_info)
            });
            
            match rows {
                Ok(rows) => {
                    for row in rows {
                        if let Ok(contact) = row {
                            text_output.push(contact);
                        }
                    }
                },
                Err(_) => {}
            }
        },
        Err(_) => {}
    }
    
    if text_output.is_empty() {
        let db_info = format!("Database path: {}\n", db_path.display());
        return Ok(ContactResponse {
            contacts: Vec::new(),
        });
    }
    
    // Sort contacts alphabetically - contacts first, then emails, then phones
    text_output.sort_by(|a, b| {
        if a.starts_with("Contact") && !b.starts_with("Contact") {
            std::cmp::Ordering::Less
        } else if !a.starts_with("Contact") && b.starts_with("Contact") {
            std::cmp::Ordering::Greater
        } else if a.starts_with("Email") && b.starts_with("Phone") {
            std::cmp::Ordering::Less
        } else if a.starts_with("Phone") && b.starts_with("Email") {
            std::cmp::Ordering::Greater
        } else {
            a.cmp(b)
        }
    });
    
    Ok(ContactResponse {
        contacts: contact_map.into_values().collect(),
    })
}

// Tauri commands
#[tauri::command]
async fn get_conversations() -> Result<Vec<Conversation>, AppError> {
    let db_path = match get_imessage_db_path() {
        Ok(path) => path,
        Err(e) => return Err(e),
    };
    
    let conn = match Connection::open(&db_path) {
        Ok(conn) => conn,
        Err(e) => return Err(AppError::DatabaseConnectionError(e)),
    };
    
    let query = r#"
        SELECT 
            c.ROWID as chat_id, 
            c.display_name,
            h.id as handle_id,
            m.text as last_message,
            MAX(m.date) as last_message_date
        FROM 
            chat c
        LEFT JOIN 
            chat_handle_join chj ON c.ROWID = chj.chat_id
        LEFT JOIN 
            handle h ON chj.handle_id = h.ROWID
        LEFT JOIN 
            chat_message_join cmj ON c.ROWID = cmj.chat_id
        LEFT JOIN 
            message m ON cmj.message_id = m.ROWID
        GROUP BY 
            c.ROWID
        ORDER BY 
            last_message_date DESC
        LIMIT 100
    "#;
    
    let mut stmt = conn.prepare(query)?;
    
    let conversation_iter = stmt.query_map([], |row| {
        let chat_id: i64 = row.get(0)?;
        let display_name: Option<String> = row.get(1)?;
        let handle_id: Option<String> = row.get(2)?;
        let last_message: Option<String> = row.get(3)?;
        
        // Handle the date separately to avoid NULL issues
        let last_message_date: Result<i64, rusqlite::Error> = row.get(4);
        let last_message_date = match last_message_date {
            Ok(date) if date > 0 => apple_time_to_unix(date / 1_000_000_000),
            _ => 0, // Default to 0 for NULL or invalid dates
        };
        
        // Clean up the display name or handle_id if it's a phone number
        let name = match (display_name, handle_id) {
            (Some(dname), _) => {
                // If display_name exists and looks like a phone number, clean it
                if dname.chars().any(|c| c.is_ascii_digit()) {
                    Some(dname.chars().filter(|c| c.is_ascii_digit()).collect())
                } else {
                    Some(dname)
                }
            },
            (None, Some(hid)) => {
                // If handle_id exists and looks like a phone number, clean it
                if hid.chars().any(|c| c.is_ascii_digit()) {
                    Some(hid.chars().filter(|c| c.is_ascii_digit()).collect())
                } else {
                    Some(hid)
                }
            },
            (None, None) => None,
        };
        
        Ok(Conversation {
            id: chat_id.to_string(),
            name,
            last_message,
            last_message_date,
        })
    })?;
    
    let mut conversations = Vec::new();
    for conversation in conversation_iter {
        if let Ok(conv) = conversation {
            conversations.push(conv);
        }
    }
    
    // If we couldn't find any conversations, try an even simpler query
    if conversations.is_empty() {
        let simple_query = r#"
            SELECT 
                c.ROWID as chat_id, 
                c.display_name,
                h.id as handle_id
            FROM 
                chat c
            LEFT JOIN 
                chat_handle_join chj ON c.ROWID = chj.chat_id
            LEFT JOIN 
                handle h ON chj.handle_id = h.ROWID
            LIMIT 100
        "#;
        
        let mut simple_stmt = conn.prepare(simple_query)?;
        
        let simple_iter = simple_stmt.query_map([], |row| {
            let chat_id: i64 = row.get(0)?;
            let display_name: Option<String> = row.get(1)?;
            let handle_id: Option<String> = row.get(2)?;
            
            // Clean up the display name or handle_id if it's a phone number
            let name = match (display_name, handle_id) {
                (Some(dname), _) => {
                    // If display_name exists and looks like a phone number, clean it
                    if dname.chars().any(|c| c.is_ascii_digit()) {
                        Some(dname.chars().filter(|c| c.is_ascii_digit()).collect())
                    } else {
                        Some(dname)
                    }
                },
                (None, Some(hid)) => {
                    // If handle_id exists and looks like a phone number, clean it
                    if hid.chars().any(|c| c.is_ascii_digit()) {
                        Some(hid.chars().filter(|c| c.is_ascii_digit()).collect())
                    } else {
                        Some(hid)
                    }
                },
                (None, None) => None,
            };
            
            Ok(Conversation {
                id: chat_id.to_string(),
                name,
                last_message: None,
                last_message_date: 0,
            })
        })?;
        
        for conversation in simple_iter {
            if let Ok(conv) = conversation {
                conversations.push(conv);
            }
        }
    }
    
    Ok(conversations)
}

#[tauri::command]
async fn get_messages(conversation_id: String) -> Result<Vec<Message>, AppError> {
    
    let db_path = get_imessage_db_path()?;
    let conn = Connection::open(&db_path).map_err(AppError::DatabaseConnectionError)?;
    
    let chat_id: i64 = conversation_id.parse().map_err(|_| AppError::OtherError("Invalid conversation ID".to_string()))?;
    
    // Query to get messages for a specific conversation with sender information
    let mut stmt = conn.prepare(r#"
        SELECT 
            m.ROWID as message_id,
            m.text,
            m.date,
            m.is_from_me,
            h.id as handle_id,
            COALESCE(h.uncanonicalized_id, h.id) as sender_id
        FROM 
            message m
        INNER JOIN 
            chat_message_join cmj ON m.ROWID = cmj.message_id
        LEFT JOIN
            handle h ON m.handle_id = h.ROWID
        WHERE 
            cmj.chat_id = ?
        ORDER BY 
            m.date ASC
        LIMIT 1000
    "#)?;
    
    let message_iter = stmt.query_map([chat_id], |row| {
        let message_id: i64 = row.get(0)?;
        let text: Option<String> = row.get(1)?;
        
        // Handle potential NULL or type issues with date
        let date: Result<i64, rusqlite::Error> = row.get(2);
        let date = match date {
            Ok(date) => apple_time_to_unix(date / 1_000_000_000),
            Err(_) => 0, // Default to 0 for NULL dates
        };
        
        // Handle potential issues with is_from_me
        let is_from_me: Result<i64, rusqlite::Error> = row.get(3);
        let is_from_me = match is_from_me {
            Ok(value) => value == 1,
            Err(_) => false, // Default to false for NULL or invalid values
        };
        
        // Get sender information
        let sender_id: Result<String, rusqlite::Error> = row.get(5);
        let sender_name = match sender_id {
            Ok(id) if !is_from_me => {
                // Extract name from phone number or email formats
                let name = if id.contains("@") {
                    // It's an email - use part before @
                    id.split('@').next().unwrap_or(&id).to_string()
                } else {
                    // Format phone number or just use the ID
                    id
                };
                Some(name)
            },
            _ => None, // No sender name for my messages or if sender_id is NULL
        };
        
        
        Ok(Message {
            id: message_id,
            text: text.unwrap_or_else(|| "[Attachment or empty message]".to_string()),
            date,
            is_from_me,
            chat_id: Some(conversation_id.clone()),
            sender_name,
        })
    })?;
    
    let mut messages = Vec::new();
    for message in message_iter {
        match message {
            Ok(msg) => messages.push(msg),
            Err(e) => println!("Error processing message: {:?}", e),
        }
    }
    
    Ok(messages)
}

// Add this before the search_messages function
#[derive(Debug)]
struct SqlParam(String);

impl rusqlite::ToSql for SqlParam {
    fn to_sql(&self) -> rusqlite::Result<rusqlite::types::ToSqlOutput<'_>> {
        self.0.to_sql()
    }
}

#[tauri::command]
async fn search_messages(query: String) -> Result<SearchResult, AppError> {
    // Parse advanced search parameters
    let mut text_query = String::new();
    let mut start_timestamp: Option<i64> = None;
    let mut end_timestamp: Option<i64> = None;
    let mut sender_filters: Vec<String> = Vec::new();
    let mut conversation_id: Option<String> = None;
    
    // Split the query by spaces, but respect quoted strings
    let mut current_part = String::new();
    let mut in_quotes = false;
    let mut chars = query.chars().peekable();
    let mut in_parentheses = false;
    
    while let Some(c) = chars.next() {
        match c {
            '(' => {
                in_parentheses = true;
                // Don't add parentheses to the text query
                continue;
            }
            ')' => {
                in_parentheses = false;
                // Don't add parentheses to the text query
                continue;
            }
            '"' => {
                in_quotes = !in_quotes;
                current_part.push(c);
            }
            ' ' if !in_quotes => {
                if !current_part.is_empty() {
                    let part = current_part.clone();
                    if part.starts_with("AFTER:") {
                        if let Some(timestamp_str) = part.strip_prefix("AFTER:") {
                            if let Ok(timestamp) = timestamp_str.parse::<i64>() {
                                start_timestamp = Some(timestamp);
                            }
                        }
                    } else if part.starts_with("BEFORE:") {
                        if let Some(timestamp_str) = part.strip_prefix("BEFORE:") {
                            if let Ok(timestamp) = timestamp_str.parse::<i64>() {
                                end_timestamp = Some(timestamp);
                            }
                        }
                    } else if part.starts_with("FROM:") {
                        // Extract the value between quotes if present
                        if let Some(sender) = part.strip_prefix("FROM:") {
                            let clean_sender = if sender.starts_with('"') && sender.ends_with('"') {
                                sender[1..sender.len()-1].to_string()
                            } else {
                                sender.to_string()
                            };
                            sender_filters.push(clean_sender);
                        }
                    } else if part.starts_with("CONVERSATION:") {
                        // Extract the conversation ID between quotes if present
                        if let Some(conv_id) = part.strip_prefix("CONVERSATION:") {
                            let clean_id = if conv_id.starts_with('"') && conv_id.ends_with('"') {
                                conv_id[1..conv_id.len()-1].to_string()
                            } else {
                                conv_id.to_string()
                            };
                            conversation_id = Some(clean_id);
                        }
                    } else if !in_parentheses { // Only add to text query if not in parentheses
                        // Add to regular text query
                        if !text_query.is_empty() {
                            text_query.push(' ');
                        }
                        text_query.push_str(&part);
                    }
                }
                current_part.clear();
            }
            '\\' if in_quotes => {
                if let Some(next_char) = chars.next() {
                    current_part.push(next_char);
                }
            }
            'O' if current_part.ends_with(" OR") && in_parentheses => {
                // Skip "OR" when in parentheses
                current_part.clear();
            }
            'R' if current_part.ends_with(" O") && in_parentheses => {
                // Skip "OR" when in parentheses
                current_part.clear();
            }
            _ => current_part.push(c),
        }
    }
    
    // Process the last part if any
    if !current_part.is_empty() {
        let part = current_part;
        if part.starts_with("FROM:") {
            if let Some(sender) = part.strip_prefix("FROM:") {
                let clean_sender = if sender.starts_with('"') && sender.ends_with('"') {
                    sender[1..sender.len()-1].to_string()
                } else {
                    sender.to_string()
                };
                sender_filters.push(clean_sender);
            }
        } else if part.starts_with("CONVERSATION:") {
            if let Some(conv_id) = part.strip_prefix("CONVERSATION:") {
                let clean_id = if conv_id.starts_with('"') && conv_id.ends_with('"') {
                    conv_id[1..conv_id.len()-1].to_string()
                } else {
                    conv_id.to_string()
                };
                conversation_id = Some(clean_id);
            }
        } else if !part.starts_with("AFTER:") && !part.starts_with("BEFORE:") && !in_parentheses {
            if !text_query.is_empty() {
                text_query.push(' ');
            }
            text_query.push_str(&part);
        }
    }
    
    // If text query is empty after parsing special commands, search for all messages
    if text_query.is_empty() {
        text_query = "%".to_string();
    } else {
        text_query = format!("%{}%", text_query);
    }
    
    let db_path = get_imessage_db_path()?;
    let conn = Connection::open(&db_path).map_err(AppError::DatabaseConnectionError)?;
    
    // Start building the SQL query with additional WHERE clauses
    let mut sql = String::from(r#"
        SELECT 
            m.ROWID as message_id,
            m.text,
            m.date,
            m.is_from_me,
            cmj.chat_id,
            h.id as handle_id,
            COALESCE(h.uncanonicalized_id, h.id) as sender_id
        FROM 
            message m
        INNER JOIN 
            chat_message_join cmj ON m.ROWID = cmj.message_id
        LEFT JOIN
            handle h ON m.handle_id = h.ROWID
        WHERE 1=1
    "#);
    
    // Add text search if provided (not empty and not just %)
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    if text_query != "%" {
        sql.push_str(" AND m.text LIKE ?");
        params.push(Box::new(text_query));
    }
    
    // Add date filters if provided
    if let Some(start_time) = start_timestamp {
        let apple_start = (start_time - 978307200) * 1_000_000_000;
        sql.push_str(" AND m.date >= ?");
        params.push(Box::new(apple_start));
    }
    
    if let Some(end_time) = end_timestamp {
        let apple_end = (end_time - 978307200) * 1_000_000_000;
        sql.push_str(" AND m.date <= ?");
        params.push(Box::new(apple_end));
    }
    
    // Add sender filters if provided - now handling multiple senders with OR logic
    if !sender_filters.is_empty() {
        sql.push_str(" AND (");
        let mut first = true;
        
        for sender in sender_filters {
            if !first {
                sql.push_str(" OR ");
            }
            first = false;
            
            // Check if sender might be a phone number
            let is_numeric = sender.chars().all(|c| c.is_digit(10) || c == '+' || c == '-' || c == '(' || c == ')' || c == ' ');
            
            if is_numeric {
                // For phone numbers, search with wildcard to handle different formats
                let numeric_only: String = sender.chars().filter(|c| c.is_digit(10)).collect();
                if !numeric_only.is_empty() {
                    sql.push_str("(h.id LIKE ? OR h.uncanonicalized_id LIKE ?)");
                    let pattern = format!("%{}%", numeric_only);
                    params.push(Box::new(pattern.clone()));
                    params.push(Box::new(pattern));
                } else {
                    sql.push_str("(h.id LIKE ? OR h.uncanonicalized_id LIKE ?)");
                    let pattern = format!("%{}%", sender);
                    params.push(Box::new(pattern.clone()));
                    params.push(Box::new(pattern));
                }
            } else if sender.contains('@') {
                // For emails, do exact match (case insensitive)
                sql.push_str("(LOWER(h.id) = LOWER(?) OR LOWER(h.uncanonicalized_id) = LOWER(?))");
                params.push(Box::new(sender.clone()));
                params.push(Box::new(sender));
            } else {
                // For names or other identifiers, use LIKE
                sql.push_str("(h.id LIKE ? OR h.uncanonicalized_id LIKE ?)");
                let pattern = format!("%{}%", sender);
                params.push(Box::new(pattern.clone()));
                params.push(Box::new(pattern));
            }
        }
        
        sql.push_str(")");
    }
    
    // Add conversation filter if provided
    if let Some(conv_id) = conversation_id {
        sql.push_str(" AND cmj.chat_id = ?");
        // Convert string to i64 for SQLite
        if let Ok(chat_id) = conv_id.parse::<i64>() {
            params.push(Box::new(chat_id));
        } else {
            println!("Invalid conversation ID format: {}", conv_id);
            return Ok(SearchResult {
                messages: Vec::new(),
                total_count: 0,
            });
        }
    }
    
    // Add ordering and limit
    sql.push_str(" ORDER BY m.date DESC LIMIT 500");
    
    let mut stmt = conn.prepare(&sql)?;
    
    // Create a slice of ToSql trait objects from our params vector
    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    
    let message_iter = stmt.query_map(param_refs.as_slice(), |row| {
        let message_id: i64 = row.get(0)?;
        let text: Option<String> = row.get(1)?;
        
        // Handle potential NULL or type issues with date
        let date: Result<i64, rusqlite::Error> = row.get(2);
        let date = match date {
            Ok(date) => apple_time_to_unix(date / 1_000_000_000),
            Err(_) => 0, // Default to 0 for NULL dates
        };
        
        // Handle potential issues with is_from_me
        let is_from_me: Result<i64, rusqlite::Error> = row.get(3);
        let is_from_me = match is_from_me {
            Ok(value) => value == 1,
            Err(_) => false, // Default to false for NULL or invalid values
        };

        // Get chat_id
        let chat_id: Result<i64, rusqlite::Error> = row.get(4);
        let chat_id = match chat_id {
            Ok(id) => Some(id.to_string()),
            Err(_) => None,
        };
        
        // Get sender information
        let sender_id: Result<String, rusqlite::Error> = row.get(6);
        let sender_name = match sender_id {
            Ok(id) if !is_from_me => {
               
                Some(id)
            },
            _ => None, // No sender name for my messages or if sender_id is NULL
        };
        
        Ok(Message {
            id: message_id,
            text: text.unwrap_or_else(|| "[Attachment or empty message]".to_string()),
            date,
            is_from_me,
            chat_id,
            sender_name,
        })
    })?;
    
    let mut messages = Vec::new();
    for message in message_iter {
        match message {
            Ok(msg) => messages.push(msg),
            Err(e) => println!("Error processing search result: {:?}", e),
        }
    }
    
    let total_count = messages.len();
    println!("Total matching messages found: {}", total_count);
    
    Ok(SearchResult {
        messages,
        total_count,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_conversations,
            get_messages,
            search_messages,
            read_contacts
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
