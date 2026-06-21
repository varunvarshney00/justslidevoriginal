use futures_util::StreamExt;
use tauri::{Emitter, Listener, Manager, WebviewUrl, WebviewWindowBuilder};

fn build_prompt(query: &str) -> Vec<serde_json::Value> {
    // Teacher-style prompt: explains concepts with drawings AND natural handwritten sentences
    let system = r##"You are a friendly teacher explaining concepts on a whiteboard. You draw diagrams AND write short, natural sentences like a real human would — not labels, but actual explanations in casual handwriting style.

Output ONLY one JSON object per line. No markdown, no commentary.

Canvas: 1920 wide x 1080 tall.

Your teaching style:
1. Write the topic title at the top as a friendly phrase
2. Draw the main diagram with shapes, arrows, lines
3. Write SHORT explanatory sentences next to your drawings, like a teacher scribbles:
   - "this part absorbs the light"
   - "energy flows from here to here"
   - "notice how these connect!"
   - "this is the key idea ->"
4. Use arrows to point from your notes to relevant parts
5. Add a summary sentence at the bottom

Text must read like natural human writing, NOT like a textbook:
- YES: "so basically, the sun gives energy to the leaf"
- YES: "these 3 sides make it a triangle!"
- YES: "water + CO2 goes in, sugar comes out"
- NO: "Photosynthesis Process"
- NO: "Input: H2O"
- NO: "Component A"

Layout rules:
- Title at top center (y=60), size 36-42
- Main diagram center (y=200-700)
- Written notes beside drawings (size 18-24)
- Summary at bottom (y=900+), size 22-28
- Labels next to shapes, offset 40px
- Keep 120px gap between elements
- dot r=3-8, circle r=20-150

Commands:
{"cmd":"text","x":N,"y":N,"text":"...","color":"#hex","size":N}
{"cmd":"line","x1":N,"y1":N,"x2":N,"y2":N,"color":"#hex","width":N}
{"cmd":"circle","cx":N,"cy":N,"r":20-150,"color":"#hex","width":N}
{"cmd":"rect","x":N,"y":N,"w":N,"h":N,"color":"#hex","width":N}
{"cmd":"arrow","x1":N,"y1":N,"x2":N,"y2":N,"color":"#hex","width":N}
{"cmd":"dot","cx":N,"cy":N,"r":3-8,"color":"#hex"}
{"cmd":"label","x":N,"y":N,"text":"...","color":"#hex","size":N,"bg":"rgba(0,0,0,0.7)"}

Output 15-25 commands. Mix diagrams with written explanations. Be a teacher, not a machine."##;

    let example1_assistant = r##"{"cmd":"text","x":960,"y":50,"text":"Let me show you the Solar System!","color":"#ffdd00","size":38}
{"cmd":"text","x":250,"y":160,"text":"everything orbits around this big guy ->","color":"#aaaaaa","size":20}
{"cmd":"circle","cx":250,"cy":450,"r":60,"color":"#ffaa00","width":4}
{"cmd":"label","x":250,"y":530,"text":"Sun","color":"#ffaa00","size":22,"bg":"rgba(0,0,0,0.7)"}
{"cmd":"text","x":250,"y":580,"text":"super hot ball of gas!","color":"#ff8844","size":18}
{"cmd":"line","x1":320,"y1":450,"x2":1750,"y2":450,"color":"#333333","width":1}
{"cmd":"dot","cx":420,"cy":450,"r":4,"color":"#aaaaaa"}
{"cmd":"label","x":420,"y":485,"text":"Mercury","color":"#aaaaaa","size":16,"bg":"rgba(0,0,0,0.7)"}
{"cmd":"dot","cx":550,"cy":450,"r":5,"color":"#ff8844"}
{"cmd":"label","x":550,"y":485,"text":"Venus","color":"#ff8844","size":16,"bg":"rgba(0,0,0,0.7)"}
{"cmd":"dot","cx":700,"cy":450,"r":6,"color":"#4488ff"}
{"cmd":"label","x":700,"y":485,"text":"Earth","color":"#4488ff","size":16,"bg":"rgba(0,0,0,0.7)"}
{"cmd":"text","x":700,"y":520,"text":"that's us! :)","color":"#88ccff","size":18}
{"cmd":"dot","cx":850,"cy":450,"r":5,"color":"#ff4422"}
{"cmd":"label","x":850,"y":485,"text":"Mars","color":"#ff4422","size":16,"bg":"rgba(0,0,0,0.7)"}
{"cmd":"text","x":1050,"y":340,"text":"these outer ones are MUCH bigger","color":"#aaaaaa","size":20}
{"cmd":"arrow","x1":1050,"y1":360,"x2":1050,"y2":410,"color":"#aaaaaa","width":2}
{"cmd":"circle","cx":1050,"cy":450,"r":35,"color":"#ffcc66","width":3}
{"cmd":"label","x":1050,"y":505,"text":"Jupiter","color":"#ffcc66","size":16,"bg":"rgba(0,0,0,0.7)"}
{"cmd":"circle","cx":1250,"cy":450,"r":30,"color":"#ddaa44","width":3}
{"cmd":"label","x":1250,"y":505,"text":"Saturn","color":"#ddaa44","size":16,"bg":"rgba(0,0,0,0.7)"}
{"cmd":"dot","cx":1450,"cy":450,"r":7,"color":"#66ccff"}
{"cmd":"label","x":1450,"y":485,"text":"Uranus","color":"#66ccff","size":16,"bg":"rgba(0,0,0,0.7)"}
{"cmd":"dot","cx":1650,"cy":450,"r":7,"color":"#4466ff"}
{"cmd":"label","x":1650,"y":485,"text":"Neptune","color":"#4466ff","size":16,"bg":"rgba(0,0,0,0.7)"}
{"cmd":"text","x":960,"y":920,"text":"8 planets, all orbiting the Sun due to gravity","color":"#ffffff","size":24}
{"cmd":"text","x":960,"y":970,"text":"the closer to the Sun, the faster they go!","color":"#88ff88","size":22}"##;

    let example2_assistant = r##"{"cmd":"text","x":960,"y":50,"text":"How Photosynthesis Works","color":"#00ff88","size":40}
{"cmd":"text","x":300,"y":150,"text":"plants are basically solar-powered!","color":"#88ff88","size":20}
{"cmd":"circle","cx":300,"cy":280,"r":50,"color":"#ffdd00","width":3}
{"cmd":"label","x":300,"y":210,"text":"Sunlight","color":"#ffdd00","size":20,"bg":"rgba(0,0,0,0.7)"}
{"cmd":"arrow","x1":360,"y1":310,"x2":550,"y2":420,"color":"#ffdd00","width":3}
{"cmd":"text","x":480,"y":350,"text":"light energy goes in","color":"#ffdd00","size":18}
{"cmd":"rect","x":550,"y":350,"w":400,"h":300,"color":"#00aa44","width":3}
{"cmd":"text","x":750,"y":500,"text":"the magic happens","color":"#00ff88","size":22}
{"cmd":"text","x":750,"y":530,"text":"inside the leaf!","color":"#00ff88","size":22}
{"cmd":"arrow","x1":400,"y1":700,"x2":550,"y2":580,"color":"#4488ff","width":3}
{"cmd":"text","x":300,"y":720,"text":"water from roots","color":"#4488ff","size":20}
{"cmd":"arrow","x1":400,"y1":780,"x2":550,"y2":620,"color":"#aaaaaa","width":3}
{"cmd":"text","x":280,"y":800,"text":"CO2 from the air we breathe out","color":"#aaaaaa","size":18}
{"cmd":"arrow","x1":950,"y1":420,"x2":1200,"y2":330,"color":"#ff8844","width":3}
{"cmd":"text","x":1350,"y":300,"text":"out comes glucose (food!)","color":"#ff8844","size":20}
{"cmd":"arrow","x1":950,"y1":550,"x2":1200,"y2":550,"color":"#00ffff","width":3}
{"cmd":"text","x":1350,"y":550,"text":"and oxygen for us to breathe","color":"#00ffff","size":20}
{"cmd":"text","x":960,"y":920,"text":"6CO2 + 6H2O + light -> C6H12O6 + 6O2","color":"#ffffff","size":26}
{"cmd":"text","x":960,"y":970,"text":"so basically... plants eat sunlight and give us air!","color":"#88ff88","size":22}"##;

    serde_json::json!([
        { "role": "system", "content": system },
        { "role": "user", "content": "Explain: solar system" },
        { "role": "assistant", "content": example1_assistant },
        { "role": "user", "content": "Explain: photosynthesis" },
        { "role": "assistant", "content": example2_assistant },
        { "role": "user", "content": format!("Explain: {}", query) }
    ]).as_array().unwrap().clone()
}

#[tauri::command]
async fn start_explain(app: tauri::AppHandle, query: String) -> Result<(), String> {
    eprintln!("[clicky] start_explain called with query: {}", query);

    // Close existing overlay if it exists (e.g. from a previous run)
    if let Some(existing) = app.get_webview_window("overlay") {
        eprintln!("[clicky] closing existing overlay window");
        let _ = existing.close();
        // Small delay to let it close
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
    }

    // Create fullscreen transparent overlay window
    let _overlay = WebviewWindowBuilder::new(
        &app,
        "overlay",
        WebviewUrl::App("src/overlay/overlay.html".into()),
    )
    .transparent(true)
    .decorations(false)
    .always_on_top(true)
    .fullscreen(true)
    .title("Clicky Overlay")
    .visible(false)
    .build()
    .map_err(|e| {
        eprintln!("[clicky] ERROR creating overlay: {}", e);
        e.to_string()
    })?;

    eprintln!("[clicky] overlay window created successfully");

    // Hide the main window
    if let Some(main_win) = app.get_webview_window("main") {
        let _ = main_win.hide();
    }

    // Spawn streaming task — wait for overlay to load
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        eprintln!("[clicky] waiting for overlay to initialize...");

        // Wait for overlay-ready event using std::sync (safe in listener callback)
        let (tx, rx) = std::sync::mpsc::channel::<()>();
        let _id = app_handle.listen_any("overlay-ready", move |_| {
            eprintln!("[clicky] overlay-ready signal received!");
            let _ = tx.send(());
        });

        // Wait up to 5 seconds for overlay to be ready
        match rx.recv_timeout(std::time::Duration::from_secs(5)) {
            Ok(()) => eprintln!("[clicky] overlay ready, starting stream"),
            Err(_) => eprintln!("[clicky] overlay ready timeout, starting stream anyway"),
        }

        // Show window now that the overlay page is loaded and styling has settled
        if let Some(overlay_win) = app_handle.get_webview_window("overlay") {
            let _ = overlay_win.show();
            let _ = overlay_win.set_focus();
        }

        // Small extra delay to be safe
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;

        eprintln!("[clicky] streaming task started");
        match stream_drawing(&app_handle, &query).await {
            Ok(_) => eprintln!("[clicky] streaming completed successfully"),
            Err(e) => {
                eprintln!("[clicky] streaming ERROR: {}", e);
                let _ = app_handle.emit("drawing-error", e.to_string());
            }
        }
        let _ = app_handle.emit("drawing-done", ());
    });

    Ok(())
}

async fn stream_drawing(
    app: &tauri::AppHandle,
    query: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    eprintln!("[clicky] stream_drawing: connecting to OpenAI...");

    let api_key = std::env::var("OPENAI_API_KEY")
        .map_err(|_| "OPENAI_API_KEY environment variable not set")?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()?;

    let messages = build_prompt(query);
    let body = serde_json::json!({
        "model": "gpt-4o-mini",
        "messages": messages,
        "stream": true,
        "temperature": 0.3,
        "max_tokens": 2048,
        "top_p": 0.9
    });
    eprintln!("[clicky] stream_drawing: sending request...");

    let response = client
        .post("https://api.openai.com/v1/chat/completions")
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&body)
        .send()
        .await?;

    eprintln!("[clicky] stream_drawing: got response status {}", response.status());

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("OpenAI API error ({}): {}", status, error_text).into());
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut content_buffer = String::new();
    let mut chunk_count = 0;

    eprintln!("[clicky] stream_drawing: starting to read SSE stream...");

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result?;
        chunk_count += 1;
        let chunk_str = String::from_utf8_lossy(&chunk);
        buffer.push_str(&chunk_str);

        if chunk_count <= 3 {
            eprintln!("[clicky] chunk #{}: {}", chunk_count, chunk_str.chars().take(200).collect::<String>());
        }

        // OpenAI streams Server-Sent Events: "data: {json}\n\n"
        while let Some(newline_pos) = buffer.find('\n') {
            let line: String = buffer.drain(..=newline_pos).collect();
            let line = line.trim();

            if line.is_empty() {
                continue;
            }

            // Strip the "data: " SSE prefix
            let data = if let Some(stripped) = line.strip_prefix("data: ") {
                stripped.trim()
            } else {
                continue;
            };

            // OpenAI signals completion with "data: [DONE]"
            if data == "[DONE]" {
                eprintln!("[clicky] stream done signal received. Remaining buffer: {}", content_buffer);
                extract_and_emit_commands_final(app, &mut content_buffer);
                return Ok(());
            }

            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                // OpenAI SSE format: choices[0].delta.content
                if let Some(content) = parsed["choices"][0]["delta"]["content"].as_str() {
                    content_buffer.push_str(content);
                    if chunk_count <= 5 {
                        eprintln!("[clicky] content_buffer now: {}", content_buffer.chars().take(300).collect::<String>());
                    }
                    extract_and_emit_commands(app, &mut content_buffer);
                }
            }
        }
    }

    eprintln!("[clicky] stream ended (no done signal). chunks={}, remaining buffer: {}", chunk_count, content_buffer);
    // Final flush for any remaining content
    extract_and_emit_commands_final(app, &mut content_buffer);
    Ok(())
}

/// Extract JSON objects from the content buffer using brace matching.
fn extract_and_emit_commands(app: &tauri::AppHandle, buffer: &mut String) {
    loop {
        let start = match buffer.find('{') {
            Some(pos) => pos,
            None => {
                if let Some(last_newline) = buffer.rfind('\n') {
                    buffer.drain(..=last_newline);
                }
                return;
            }
        };

        let mut depth = 0;
        let mut in_string = false;
        let mut escape_next = false;
        let mut end = None;

        for (i, ch) in buffer[start..].char_indices() {
            if escape_next {
                escape_next = false;
                continue;
            }
            match ch {
                '\\' if in_string => escape_next = true,
                '"' => in_string = !in_string,
                '{' if !in_string => depth += 1,
                '}' if !in_string => {
                    depth -= 1;
                    if depth == 0 {
                        end = Some(start + i + 1);
                        break;
                    }
                }
                _ => {}
            }
        }

        match end {
            Some(end_pos) => {
                let json_str = &buffer[start..end_pos];
                if let Ok(cmd) = serde_json::from_str::<serde_json::Value>(json_str) {
                    if cmd.get("cmd").is_some() {
                        eprintln!("[clicky] emit cmd: {}", cmd);
                        let _ = app.emit("drawing-cmd", &cmd);
                    }
                }
                buffer.drain(..end_pos);
            }
            None => {
                if start > 0 {
                    buffer.drain(..start);
                }
                return;
            }
        }
    }
}

/// Final flush: same as above but also tries to parse any remaining partial content.
fn extract_and_emit_commands_final(app: &tauri::AppHandle, buffer: &mut String) {
    extract_and_emit_commands(app, buffer);

    let remaining = buffer.trim();
    if remaining.is_empty() {
        return;
    }

    let clean = remaining
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    if let Ok(cmd) = serde_json::from_str::<serde_json::Value>(clean) {
        if cmd.get("cmd").is_some() {
            eprintln!("[clicky] emit final cmd: {}", cmd);
            let _ = app.emit("drawing-cmd", &cmd);
        }
    }
    buffer.clear();
}

#[tauri::command]
async fn close_overlay(app: tauri::AppHandle) -> Result<(), String> {
    eprintln!("[clicky] close_overlay called");
    if let Some(main_win) = app.get_webview_window("main") {
        let _ = main_win.show();
        let _ = main_win.set_focus();
    }
    if let Some(overlay) = app.get_webview_window("overlay") {
        let _ = overlay.close();
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load .env file from src-tauri directory
    dotenvy::dotenv().ok();

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![start_explain, close_overlay])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
