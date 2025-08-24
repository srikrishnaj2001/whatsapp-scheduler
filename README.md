# WhatsApp Group Manager Backend

A backend service for managing WhatsApp groups using the Wasender API.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```

3. Add your Wasender API credentials to `.env`:
```
PORT=8009
NODE_ENV=development
WASENDER_API_BASE_URL=https://wasenderapi.com/api
WASENDER_API_KEY=your_api_key_here
WHATSAPP_SESSION_NAME=default_session
```

4. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## API Endpoints

### Health Check
- **GET** `/health` - Check if service is running

### Session Management

#### Generate QR Code
- **POST** `/api/session/qr-code`
- **Description**: Generates a QR code for WhatsApp login
- **Response**:
```json
{
  "status": "success",
  "data": {
    "qrCode": "base64_qr_code_string",
    "sessionName": "default_session"
  }
}
```

#### Check Session Status
- **GET** `/api/session/status`
- **Description**: Check if there's an active WhatsApp session and get user details
- **Response**:
```json
{
  "status": "success",
  "data": {
    "isLoggedIn": true,
    "sessionName": "default_session",
    "user": {
      "phoneNumber": "+1234567890",
      "name": "User Name"
    }
  }
}
```

#### Logout
- **POST** `/api/session/logout`
- **Description**: Logout from current WhatsApp session
- **Response**:
```json
{
  "status": "success",
  "message": "Successfully logged out"
}
```

### Group Management

#### Get Admin Groups
- **GET** `/api/groups/admin`
- **Description**: Fetch all groups where the logged-in user is an admin
- **Response**:
```json
{
  "status": "success",
  "data": {
    "totalGroups": 5,
    "groups": [
      {
        "id": "group_jid",
        "name": "Group Name",
        "description": "Group Description",
        "participantsCount": 50,
        "createdAt": "timestamp"
      }
    ]
  }
}
```

#### Get Group Details
- **GET** `/api/groups/:groupId`
- **Description**: Get metadata for a specific group
- **Parameters**: `groupId` - WhatsApp group JID

#### Get Group Participants
- **GET** `/api/groups/:groupId/participants`
- **Description**: Get all participants of a group
- **Parameters**: `groupId` - WhatsApp group JID

### Message Management

#### Send Text Message
- **POST** `/api/messages/text`
- **Description**: Send a text message to a group
- **Body**:
```json
{
  "groupId": "group_jid",
  "message": "Hello, World!"
}
```
- **Response**:
```json
{
  "status": "success",
  "message": "Message sent successfully",
  "data": {}
}
```

#### Send Image Message
- **POST** `/api/messages/image`
- **Description**: Send an image with optional caption to a group
- **Content-Type**: `multipart/form-data`
- **Body**:
  - `groupId` (required): WhatsApp group JID
  - `image` (required): Image file (JPEG, PNG, GIF, or WebP)
  - `caption` (optional): Image caption text
- **Response**:
```json
{
  "status": "success",
  "message": "Image sent successfully",
  "data": {}
}
```

#### Broadcast Message
- **POST** `/api/messages/broadcast`
- **Description**: Send the same message to multiple groups
- **Body**:
```json
{
  "groupIds": ["group_jid_1", "group_jid_2"],
  "message": "Broadcast message"
}
```
- **Response**:
```json
{
  "status": "success",
  "message": "Broadcast completed",
  "data": {
    "totalGroups": 2,
    "successful": 2,
    "failed": 0,
    "results": [],
    "errors": []
  }
}
```

## Error Responses

All endpoints return errors in the following format:
```json
{
  "status": "error",
  "message": "Error description"
}
```

Common HTTP status codes:
- `400` - Bad Request (missing required parameters)
- `401` - Unauthorized (no active WhatsApp session)
- `404` - Not Found
- `500` - Internal Server Error

## Rate Limiting

To avoid being blocked by WhatsApp:
- Broadcast messages have a 1-second delay between each message
- Avoid sending too many messages in a short period
- Follow WhatsApp's terms of service

## Security

- Always keep your API key secure
- Use HTTPS in production
- Implement additional authentication as needed
- Never commit `.env` file to version control

## Frontend Features

### Modern Premium UI
- **Glassmorphism Design**: Beautiful glass-like components with backdrop blur effects
- **Dark Mode**: Sleek dark theme with neon accents and glowing effects
- **Bento Grid Layout**: Modern card-based layout with responsive design
- **Futuristic Animations**: Floating elements, gradient animations, and smooth transitions

### Login Page (`/`)
- Phone number input with validation
- QR code generation and display
- Real-time session polling for automatic login detection
- Animated loading states and transitions

### Dashboard Page (`/dashboard`)
- **Session Management**: Automatic session validation and redirect
- **Group Selection**: 
  - Searchable and filterable group list
  - Multi-select functionality with visual feedback
  - Admin groups only (automatically filtered)
- **Rich Text Editor**:
  - Bold, italic, underline formatting
  - Emoji insertion
  - Character counter (4096 limit)
  - Quick message templates
- **Message Broadcasting**: Send to multiple groups simultaneously
- **Real-time Stats**: Message count, success rates, group statistics
- **Activity Feed**: Recent message history and status updates

### Key Frontend Technologies
- **EJS**: Server-side templating
- **Tailwind CSS**: Utility-first CSS framework
- **Alpine.js**: Lightweight JavaScript framework for interactivity
- **Font Awesome**: Premium icon library
- **Inter Font**: Modern typography

### Usage Flow
1. Visit `/` → Enter phone number → Generate QR code
2. Scan QR code with WhatsApp → Automatic redirect to dashboard
3. Load admin groups → Select target groups
4. Compose message with rich text editor → Send to selected groups
5. View real-time delivery status and statistics

### Visual Features
- **Neon borders** and **glow effects**
- **Gradient backgrounds** with animated movement
- **Glass morphism** cards and panels
- **Floating animations** and **smooth transitions**
- **Responsive design** for mobile and desktop
- **Premium color scheme** with WhatsApp green accents