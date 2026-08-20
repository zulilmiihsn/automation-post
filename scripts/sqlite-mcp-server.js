const Database = require('better-sqlite3');
const path = require('path');
const readline = require('readline');

// First argument is the database path
const dbPath = process.argv[2] || path.join(__dirname, '../data/database.sqlite');

let db;
try {
  db = new Database(dbPath);
  console.error(`Connected to SQLite database at ${dbPath}`);
} catch (err) {
  console.error(`Failed to connect to database at ${dbPath}:`, err);
  process.exit(1);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', (line) => {
  if (!line.trim()) return;
  try {
    const message = JSON.parse(line);
    
    // Check if it is a request or notification
    if (message.id !== undefined) {
      handleRequest(message);
    } else {
      handleNotification(message);
    }
  } catch (err) {
    console.error('Error handling line:', err);
  }
});

function sendResponse(id, result) {
  const response = {
    jsonrpc: '2.0',
    id,
    result
  };
  process.stdout.write(JSON.stringify(response) + '\n');
}

function sendError(id, code, message, data) {
  const response = {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      ...(data && { data })
    }
  };
  process.stdout.write(JSON.stringify(response) + '\n');
}

function handleRequest(req) {
  const { id, method, params } = req;
  
  if (method === 'initialize') {
    return sendResponse(id, {
      protocolVersion: params.protocolVersion || '2024-11-05',
      capabilities: {
        tools: {}
      },
      serverInfo: {
        name: 'sqlite-mcp-server',
        version: '1.0.0'
      }
    });
  }
  
  if (method === 'tools/list') {
    return sendResponse(id, {
      tools: [
        {
          name: 'query',
          description: 'Execute a SQL query against the SQLite database. Supports SELECT, INSERT, UPDATE, DELETE.',
          inputSchema: {
            type: 'object',
            properties: {
              sql: {
                type: 'string',
                description: 'The exact SQL query to execute'
              }
            },
            required: ['sql']
          }
        },
        {
          name: 'list_tables',
          description: 'List all tables inside the SQLite database.',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'describe_table',
          description: 'Describe columns, types, and schema of a specific table.',
          inputSchema: {
            type: 'object',
            properties: {
              table: {
                type: 'string',
                description: 'The table name to describe'
              }
            },
            required: ['table']
          }
        }
      ]
    });
  }
  
  if (method === 'tools/call') {
    const { name, arguments: args } = params || {};
    try {
      if (name === 'query') {
        const sql = args.sql;
        if (!sql) {
          return sendResponse(id, {
            content: [{ type: 'text', text: 'Error: sql argument is required' }],
            isError: true
          });
        }
        
        const normalizedSql = sql.trim().toLowerCase();
        if (normalizedSql.startsWith('select') || normalizedSql.startsWith('pragma') || normalizedSql.startsWith('explain')) {
          const rows = db.prepare(sql).all();
          return sendResponse(id, {
            content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }]
          });
        } else {
          const stmt = db.prepare(sql);
          const info = stmt.run();
          return sendResponse(id, {
            content: [{ type: 'text', text: JSON.stringify({
              changes: info.changes,
              lastInsertRowid: info.lastInsertRowid.toString()
            }, null, 2) }]
          });
        }
      }
      
      if (name === 'list_tables') {
        const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
        const tables = rows.map(r => r.name);
        return sendResponse(id, {
          content: [{ type: 'text', text: JSON.stringify(tables, null, 2) }]
        });
      }
      
      if (name === 'describe_table') {
        const table = args.table;
        if (!table) {
          return sendResponse(id, {
            content: [{ type: 'text', text: 'Error: table argument is required' }],
            isError: true
          });
        }
        const info = db.prepare(`PRAGMA table_info(${table})`).all();
        return sendResponse(id, {
          content: [{ type: 'text', text: JSON.stringify(info, null, 2) }]
        });
      }
      
      return sendResponse(id, {
        content: [{ type: 'text', text: `Error: Tool not found: ${name}` }],
        isError: true
      });
    } catch (err) {
      return sendResponse(id, {
        content: [{ type: 'text', text: `SQL Error: ${err.message}` }],
        isError: true
      });
    }
  }
  
  // Standard method not found error
  sendError(id, -32601, `Method not found: ${method}`);
}

function handleNotification(msg) {
  console.error(`Received notification: ${msg.method}`);
}
