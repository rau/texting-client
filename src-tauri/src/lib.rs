// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::fs;
use std::fmt;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use rusqlite::OptionalExtension;
use chrono;
use std::process::Command;
use log::{info, error, warn};
use simplelog::*;
use std::fs::File;
use std::time::Duration;
use std::thread;

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
    chat_id: Option<String>,
    sender_name: Option<String>,
    attachment_path: Option<String>,
    conversation_name: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SearchResult {
    messages: Vec<Message>,
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
    PermissionError(String),
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
            AppError::PermissionError(s) => write!(f, "Permission error: {}", s),
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
    info!("Entering get_imessage_db_path");
    
    // On macOS, the iMessage db is in ~/Library/Messages/chat.db
    let home = match dirs::home_dir() {
        Some(path) => {
            info!("Found home directory: {:?}", path);
            path
        },
        None => {
            error!("Failed to get home directory");
            return Err(AppError::OtherError("Home directory not found".to_string()));
        }
    };
    
    let db_path = home.join("Library/Messages/chat.db");
    info!("Checking database path: {:?}", db_path);
    
    if !db_path.exists() {
        error!("Database file not found at {:?}", db_path);
        return Err(AppError::DatabaseNotFound);
    }
    
    info!("Database file exists, checking if readable");
    
    // First, check if we have Full Disk Access using ls command
    info!("Checking Full Disk Access permission using ls command");
    let output = Command::new("ls")
        .arg("-l")
        .arg(&db_path)
        .output();
    
    match output {
        Ok(output) => {
            if output.status.success() {
                info!("Full Disk Access appears to be granted, ls command succeeded");
                // Try to open the database directly first
                info!("Attempting to open database directly");
                match Connection::open(&db_path) {
                    Ok(_) => {
                        info!("Successfully opened database at {:?}", db_path);
                        Ok(db_path)
                    },
                    Err(e) => {
                        warn!("Could not open database directly: {:?}", e);
                        error!("Even with Full Disk Access, cannot open database directly. This might be a sandboxing issue.");
                        Err(AppError::PermissionError("Full Disk Access is granted but database cannot be opened directly. Please check if the app is running in a sandbox.".to_string()))
                    }
                }
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                error!("Full Disk Access check failed. ls command output: {}", stderr);
                Err(AppError::PermissionError("Full Disk Access permission is required. Please grant Full Disk Access to the app in System Settings > Privacy & Security > Full Disk Access.".to_string()))
            }
        },
        Err(e) => {
            error!("Failed to execute ls command: {:?}", e);
            Err(AppError::PermissionError("Could not verify Full Disk Access permission. Please grant Full Disk Access to the app in System Settings > Privacy & Security > Full Disk Access.".to_string()))
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
    // Get the Sources directory path
    let home = dirs::home_dir().ok_or(AppError::OtherError("Home directory not found".to_string()))?;
    let sources_dir = home.join("Library/Application Support/AddressBook/Sources");
    
    if sources_dir.exists() {
        // Read all subdirectories in Sources (UUIDs)
        let entries = fs::read_dir(&sources_dir).map_err(AppError::IOError)?;
        
        // Find the UUID directory containing AddressBook-v22.abcddb
        for entry in entries {
            let entry = entry.map_err(AppError::IOError)?;
            let path = entry.path();
            
            if path.is_dir() {
                let abcddb_path = path.join("AddressBook-v22.abcddb");
                let db_path = path.join("AddressBook-v22.db");
                
                if abcddb_path.exists() {
                    println!("Found system AddressBook at: {:?}", abcddb_path);
                    
                    // Always copy to create/update the .db version
                    match fs::copy(&abcddb_path, &db_path) {
                        Ok(_) => {
                            println!("Successfully copied AddressBook database to: {:?}", db_path);
                            return Ok(db_path);
                        },
                        Err(e) => {
                            println!("Failed to copy AddressBook database: {:?}", e);
                            return Err(AppError::IOError(e));
                        }
                    }
                }
            }
        }
    }
    
    // If we get here, we couldn't find the database
    Err(AppError::OtherError("AddressBook database not found in Sources directory".to_string()))
}

// Read contacts from AddressBook database
#[tauri::command]
async fn read_contacts() -> Result<ContactResponse, AppError> {
    let db_path = match get_addressbook_db_path() {
        Ok(path) => path,
        Err(_e) => {
            return Ok(ContactResponse {
                contacts: Vec::new(),
            });
        }
    };
    
    let conn = match Connection::open(&db_path) {
        Ok(conn) => conn,
        Err(_e) => {
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
        // Use display name if available, otherwise use handle_id
        let name = match (display_name, handle_id) {
            (Some(dname), _) => Some(dname),
            (None, Some(hid)) => Some(hid),
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
            
            // Use display name if available, otherwise use handle_id
            let name = match (display_name, handle_id) {
                (Some(dname), _) => Some(dname),
                (None, Some(hid)) => Some(hid),
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

// Fix the get_message_attachments function
fn get_message_attachments(conn: &Connection, message_id: i64) -> Result<Option<String>, rusqlite::Error> {
    let mut stmt = conn.prepare(r#"
        SELECT 
            a.filename
        FROM 
            attachment a
        JOIN 
            message_attachment_join maj ON maj.attachment_id = a.ROWID
        WHERE 
            maj.message_id = ?
        LIMIT 1
    "#)?;

    stmt.query_row([message_id], |row| {
        row.get::<_, String>(0)
    }).optional()
}

#[tauri::command]
async fn get_messages(conversation_id: String) -> Result<Vec<Message>, AppError> {
    
    let db_path = get_imessage_db_path()?;
    let conn = Connection::open(&db_path).map_err(AppError::DatabaseConnectionError)?;
    
    let chat_id: i64 = conversation_id.parse().map_err(|_| AppError::OtherError("Invalid conversation ID".to_string()))?;
    
    // Updated query to include conversation name
    let mut stmt = conn.prepare(r#"
        SELECT 
            m.ROWID as message_id,
            m.text,
            m.date,
            m.is_from_me,
            h.id as handle_id,
            COALESCE(h.uncanonicalized_id, h.id) as sender_id,
            c.display_name as conversation_name
        FROM 
            message m
        INNER JOIN 
            chat_message_join cmj ON m.ROWID = cmj.message_id
        INNER JOIN
            chat c ON cmj.chat_id = c.ROWID
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
            Ok(id) if !is_from_me => Some(id),
            _ => None,
        };

        // Get conversation name
        let conversation_name: Option<String> = row.get(6)?;

        // Get attachment path
        let attachment_path = match get_message_attachments(&conn, message_id) {
            Ok(path) => path,
            Err(_) => None,
        };
        
        Ok(Message {
            id: message_id,
            text: text.unwrap_or_else(|| "[Attachment or empty message]".to_string()),
            date,
            is_from_me,
            chat_id: Some(conversation_id.clone()),
            sender_name,
            attachment_path,
            conversation_name,
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
#[allow(dead_code)]
struct SqlParam(String);

impl rusqlite::ToSql for SqlParam {
    fn to_sql(&self) -> rusqlite::Result<rusqlite::types::ToSqlOutput<'_>> {
        self.0.to_sql()
    }
}

#[derive(Serialize, Deserialize, Debug)]
struct ContactIdentifier {
    contact_id: Option<String>,
    phones: Vec<String>,
    emails: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug)]
struct SearchParams {
    query: String,
    start_date: Option<String>,  // yyyy-MM-dd format
    end_date: Option<String>,    // yyyy-MM-dd format
    contact_identifiers: Vec<ContactIdentifier>,
    conversation_id: Option<String>,
    show_only_my_messages: bool,
    show_only_attachments: bool,
    sort_direction: String,      // "asc" or "desc"
    conversation_type: String,   // "all", "direct", or "group"
}

// Add this helper function at the top level, before search_messages
fn normalize_phone_number(phone: &str) -> String {
    phone.chars().filter(|c| c.is_ascii_digit()).collect()
}

#[tauri::command]
async fn search_messages(params: SearchParams) -> Result<SearchResult, AppError> {
    println!("Received search params: {:?}", params);
    
    let db_path = get_imessage_db_path()?;
    let conn = Connection::open(&db_path).map_err(AppError::DatabaseConnectionError)?;

    let mut sql = r#"
        SELECT DISTINCT
            m.ROWID as message_id,
            m.text,
            m.date,
            m.is_from_me,
            cmj.chat_id,
            h.id as handle_id,
            COALESCE(h.uncanonicalized_id, h.id) as sender_id,
            (
                SELECT a.filename 
                FROM attachment a 
                JOIN message_attachment_join maj ON maj.attachment_id = a.ROWID 
                WHERE maj.message_id = m.ROWID 
                LIMIT 1
            ) as attachment_path
        FROM 
            message m
        INNER JOIN 
            chat_message_join cmj ON m.ROWID = cmj.message_id
        LEFT JOIN
            handle h ON m.handle_id = h.ROWID
        WHERE 1=1
    "#.to_string();

    // Add text search if query is not empty
    if !params.query.trim().is_empty() {
        sql.push_str(&format!(" AND m.text LIKE '%{}%'", params.query.replace('\'', "''")));
    }

    // Add contact identifier filters if any exist
    if !params.contact_identifiers.is_empty() {
        let mut conditions = Vec::new();
        
        for identifier in &params.contact_identifiers {
            let mut identifier_conditions = Vec::new();
            
            // Add contact_id condition if it exists
            if let Some(contact_id) = &identifier.contact_id {
                let escaped_id = contact_id.replace('\'', "''");
                identifier_conditions.push(format!(
                    "(h.id = '{}' OR h.uncanonicalized_id = '{}')",
                    escaped_id, escaped_id
                ));
            }
            
            // Add phone conditions with more flexible matching
            for phone in &identifier.phones {
                let numeric_phone = normalize_phone_number(phone);
                if !numeric_phone.is_empty() {
                    let last_10 = if numeric_phone.len() > 10 {
                        numeric_phone[numeric_phone.len()-10..].to_string()
                    } else {
                        numeric_phone
                    };
                    
                    identifier_conditions.push(format!(
                        "(
                            REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(h.id, '+', ''), '-', ''), ' ', ''), '(', ''), ')', '') LIKE '%{}' OR 
                            REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(h.uncanonicalized_id, '+', ''), '-', ''), ' ', ''), '(', ''), ')', '') LIKE '%{}'
                        )",
                        last_10, last_10
                    ));
                }
            }
            
            // Add email conditions (keep as is since emails are exact matches)
            for email in &identifier.emails {
                let escaped_email = email.replace('\'', "''");
                identifier_conditions.push(format!(
                    "(h.id = '{}' OR h.uncanonicalized_id = '{}')",
                    escaped_email, escaped_email
                ));
            }
            
            if !identifier_conditions.is_empty() {
                conditions.push(format!("({})", identifier_conditions.join(" OR ")));
            }
        }
        
        if !conditions.is_empty() {
            sql.push_str(" AND (");
            sql.push_str(&conditions.join(" OR "));
            sql.push_str(")");
        }
    }

    // Add conversation filter if provided
    if let Some(conv_id) = params.conversation_id {
        sql.push_str(&format!(" AND cmj.chat_id = {}", conv_id));
    }

    // Add date filters
    if let Some(start_date) = params.start_date {
        if let Some(timestamp) = date_to_apple_timestamp(&start_date) {
            sql.push_str(&format!(" AND m.date > {}", timestamp));
        }
    }
    if let Some(end_date) = params.end_date {
        if let Some(timestamp) = date_to_apple_timestamp(&end_date) {
            sql.push_str(&format!(" AND m.date < {}", timestamp));
        }
    }

    // Add show_only_my_messages filter
    if params.show_only_my_messages {
        sql.push_str(" AND m.is_from_me = 1");
    }

    // Add show_only_attachments filter
    if params.show_only_attachments {
        sql.push_str(" AND EXISTS (
            SELECT 1 
            FROM attachment a 
            JOIN message_attachment_join maj ON maj.attachment_id = a.ROWID 
            WHERE maj.message_id = m.ROWID
        )");
    }

    // Add conversation type filter
    if params.conversation_type != "all" {
        sql.push_str(" AND EXISTS (
            SELECT 1
            FROM chat c
            WHERE c.ROWID = cmj.chat_id
            AND (
                SELECT COUNT(DISTINCT h2.id)
                FROM chat_handle_join chj2
                JOIN handle h2 ON h2.ROWID = chj2.handle_id
                WHERE chj2.chat_id = c.ROWID
            ) ");
        
        if params.conversation_type == "direct" {
            sql.push_str(" <= 1");
        } else {
            sql.push_str(" > 1");
        }
        sql.push_str(")");
    }

    // Add ORDER BY clause
    sql.push_str(" ORDER BY m.date ");
    sql.push_str(&params.sort_direction.to_uppercase());
    sql.push_str(" LIMIT 100");

    println!("Executing SQL: {}", sql);

    let mut stmt = conn.prepare(&sql)?;
    let message_iter = stmt.query_map([], |row| {
        let message_id: i64 = row.get(0)?;
        let text: Option<String> = row.get(1)?;
        
        let date: Result<i64, rusqlite::Error> = row.get(2);
        let date = match date {
            Ok(date) => apple_time_to_unix(date / 1_000_000_000),
            Err(_) => 0,
        };
        
        let is_from_me: Result<i64, rusqlite::Error> = row.get(3);
        let is_from_me = match is_from_me {
            Ok(value) => value == 1,
            Err(_) => false,
        };

        let chat_id: Result<i64, rusqlite::Error> = row.get(4);
        let chat_id = match chat_id {
            Ok(id) => Some(id.to_string()),
            Err(_) => None,
        };
        
        let sender_id: Result<String, rusqlite::Error> = row.get(6);
        let sender_name = match sender_id {
            Ok(id) if !is_from_me => Some(id),
            _ => None,
        };

        let attachment_path: Option<String> = row.get(7).ok();
        
        Ok(Message {
            id: message_id,
            text: text.unwrap_or_else(|| "[Attachment or empty message]".to_string()),
            date,
            is_from_me,
            chat_id,
            sender_name,
            attachment_path,
            conversation_name: None,
        })
    })?;

    let mut messages = Vec::new();
    for message in message_iter {
        if let Ok(msg) = message {
            messages.push(msg);
        }
    }

    println!("Found {} messages", messages.len());
    Ok(SearchResult { messages })
}

// Helper function to convert date string to Apple timestamp
fn date_to_apple_timestamp(date_str: &str) -> Option<i64> {
    // Parse date in yyyy-MM-dd format
    let date = chrono::NaiveDate::parse_from_str(date_str, "%Y-%m-%d").ok()?;
    let datetime = date.and_hms_opt(23, 59, 59)?;
    let timestamp = datetime.timestamp();
    // Convert to Apple timestamp format (nanoseconds since 2001)
    Some((timestamp - 978307200) * 1_000_000_000)
}

// Add this function at the top level
fn setup_logging() -> Result<(), Box<dyn std::error::Error>> {
    let home = dirs::home_dir().ok_or("Could not find home directory")?;
    let log_path = home.join("Library/Logs/iMessage Search/app.log");

    // Create the directory if it doesn't exist
    if let Some(parent) = log_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    // Initialize the logger
    CombinedLogger::init(vec![
        WriteLogger::new(
            LevelFilter::Info,
            Config::default(),
            File::create(&log_path)?
        ),
    ])?;

    info!("Logging initialized. Log file: {:?}", log_path);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Set up logging first
    if let Err(e) = setup_logging() {
        eprintln!("Failed to set up logging: {}", e);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_conversations,
            get_messages,
            search_messages,
            read_contacts,
            check_permissions,
            open_imessage_conversation,
            restart_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// Add these helper functions before check_permissions
fn check_contacts_permission() -> Result<bool, AppError> {
    info!("Checking Contacts permission...");
    
    // First try the AppleScript way to request contacts access
    let script = r#"
        tell application "System Events"
            try
                tell current application to get the address book
                return true
            on error
                return false
            end try
        end tell
    "#;

    match Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
    {
        Ok(output) => {
            info!("AppleScript contacts check output: {:?}", output);
            if output.status.success() {
                info!("Contacts permission granted via AppleScript");
                return Ok(true);
            }
        },
        Err(e) => {
            warn!("AppleScript contacts check failed: {:?}", e);
        }
    }

    // Fallback to direct file system check
    let home = dirs::home_dir()
        .ok_or(AppError::OtherError("Home directory not found".to_string()))?;
    let sources_dir = home.join("Library/Application Support/AddressBook/Sources");
    info!("Checking Contacts directory: {:?}", sources_dir);
    
    if !sources_dir.exists() {
        warn!("Contacts directory does not exist at: {:?}", sources_dir);
        return Ok(false);
    }

    match fs::read_dir(&sources_dir) {
        Ok(_) => {
            info!("Successfully read Contacts directory");
            Ok(true)
        },
        Err(e) => {
            error!("Failed to read Contacts directory: {:?}", e);
            Ok(false)
        }
    }
}

fn check_messages_permission() -> Result<bool, AppError> {
    info!("Starting Messages permission check");
    info!("Attempting to get iMessage database path");
    
    match get_imessage_db_path() {
        Ok(path) => {
            info!("Successfully got Messages database path: {:?}", path);
            info!("Attempting to open database connection");
            match Connection::open(&path) {
                Ok(_) => {
                    info!("Successfully opened Messages database");
                    Ok(true)
                },
                Err(e) => {
                    error!("Failed to open Messages database: {:?}", e);
                    error!("Error details: {:#?}", e);
                    if e.to_string().contains("unable to open database file") {
                        info!("Error indicates permission issue");
                        Ok(false)
                    } else {
                        error!("Unexpected database error");
                        Err(AppError::DatabaseConnectionError(e))
                    }
                }
            }
        },
        Err(e) => {
            error!("Failed to get Messages database path: {:?}", e);
            error!("Error details: {:#?}", e);
            match e {
                AppError::DatabaseNotFound => {
                    info!("Database not found, likely permission issue");
                    Ok(false)
                },
                _ => {
                    error!("Unexpected error while getting database path");
                    Err(e)
                }
            }
        }
    }
}

// Update the check_permissions function
#[tauri::command]
async fn check_permissions() -> Result<bool, AppError> {
    info!("Starting full permissions check...");
    info!("Adding delay to prevent rapid rechecking...");
    
    // Add a small delay to prevent rapid rechecking
    thread::sleep(Duration::from_millis(500));
    
    info!("Starting Messages permission check...");
    let messages_result = match check_messages_permission() {
        Ok(result) => {
            info!("Messages permission check completed with result: {}", result);
            result
        },
        Err(e) => {
            error!("Messages permission check failed with error: {:?}", e);
            error!("Error details: {:#?}", e);
            return Ok(false);
        }
    };
    
    if !messages_result {
        warn!("Messages permission not granted");
        return Ok(false);
    }
    
    info!("Messages permission granted, checking Contacts permission...");
    let contacts_result = match check_contacts_permission() {
        Ok(result) => {
            info!("Contacts permission check completed with result: {}", result);
            result
        },
        Err(e) => {
            error!("Contacts permission check failed with error: {:?}", e);
            error!("Error details: {:#?}", e);
            return Ok(false);
        }
    };
    
    if messages_result && contacts_result {
        info!("All permissions granted successfully");
        Ok(true)
    } else {
        let missing = match (messages_result, contacts_result) {
            (false, false) => "Messages and Contacts",
            (false, true) => "Messages",
            (true, false) => "Contacts",
            (true, true) => unreachable!(),
        };
        warn!("Missing permissions for: {}", missing);
        Ok(false)
    }
}

#[tauri::command]
async fn open_imessage_conversation(chat_id: String) -> Result<(), AppError> {
    // Only proceed on macOS
    #[cfg(target_os = "macos")]
    {
        let script = format!(
            r#"tell application "Messages" to show chat id "iMessage;-;{}"#,
            chat_id
        );

        println!("Script: {}", script);
        println!("Open IM Message Chat ID: {}", chat_id);

        let output = Command::new("osascript")
            .arg("-e")
            .arg(script)
            .output()
            .map_err(|e| AppError::OtherError(format!("Failed to execute AppleScript: {}", e)))?;

        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr);
            return Err(AppError::OtherError(format!("AppleScript failed: {}", error)));
        }

        println!("Output: {}", output.status);

        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err(AppError::OtherError("This feature is only available on macOS".to_string()))
    }
}

// Add a new command to force quit the app
#[tauri::command]
async fn restart_app(app_handle: tauri::AppHandle) {
    info!("Restarting app...");
    app_handle.restart();
}

