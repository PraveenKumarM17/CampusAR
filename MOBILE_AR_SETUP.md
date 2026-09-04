# Mobile AR Measure Setup Guide

## Why HTTPS is Required

WebXR (used for AR Measure) requires a **secure context** (HTTPS) to access:
- Camera feed
- Device motion sensors
- AR features (hit-test, world tracking)

`localhost` works on the same machine, but accessing via IP address (e.g., `http://192.168.1.x:5173`) from a phone does NOT work without HTTPS.

---

## Setup Instructions

### 1. **Start Dev Server with HTTPS** (Already Configured)

The Vite config has been updated to enable HTTPS automatically:

```bash
# In the apps/web directory
npm run dev
```

The server will now run on **`https://localhost:5173`** instead of `http://localhost:5173`.

### 2. **Get Your Local IP Address**

**Windows:**
```bash
ipconfig
```
Look for "IPv4 Address" under your active network adapter (usually something like `192.168.1.x`)

**Mac/Linux:**
```bash
ifconfig | grep "inet "
# or
hostname -I
```

### 3. **Access from Your Phone**

**Important:** Use `https://` (not `http://`):

```
https://192.168.1.x:5173
```

Replace `192.168.1.x` with your actual IP address from step 2.

### 4. **Accept the Self-Signed Certificate**

Your phone will show a security warning because the certificate is self-signed. This is normal for development:

**Chrome on Android:**
1. Tap "Advanced"
2. Tap "Proceed to [IP address] (unsafe)"

**Safari on iOS:**
1. Tap "Show Details"
2. Tap "visit this website"
3. Tap "Visit Website" again to confirm

### 5. **Grant Camera Permissions**

When prompted:
- Allow camera access
- Allow motion sensors (on iOS)

---

## Testing AR Measure

### On Desktop (Limited):
- Navigate to: `/admin/map-builder/indoor/[building-id]`
- Click **"AR Measure"** button
- You'll see camera preview but no WebXR (shows warning)
- Can use screen overlay mode (not metric) or use 2D Measure tab

### On Phone (Full AR):
1. Access via `https://[YOUR_IP]:5173`
2. Accept certificate warning
3. Login and navigate to Indoor Map Builder
4. Select a building
5. Click **"AR Measure"** button
6. Grant camera permissions
7. Click **"Start AR"**
8. Point camera at floor/surface
9. Tap to place measurement points
10. Lines stay world-locked as you move!

---

## Device Requirements

### Android:
- **Chrome** or **Edge** browser
- **ARCore** compatible device ([Check list](https://developers.google.com/ar/devices))
- Android 7.0 or higher

### iOS:
- **Safari** browser
- iPhone 6S or newer / iPad Pro or newer
- iOS 11 or higher (iOS 12+ recommended)

---

## Troubleshooting

### "WebXR AR not available"
- ✅ Make sure you're using `https://` not `http://`
- ✅ Check that your device supports ARCore/ARKit
- ✅ Try Chrome on Android or Safari on iOS (other browsers may not support WebXR)
- ✅ Ensure both computer and phone are on the same WiFi network

### "This site can't be reached"
- ✅ Check firewall settings (allow port 5173)
- ✅ Verify IP address is correct
- ✅ Ensure dev server is running
- ✅ Both devices must be on same network

### Certificate Warnings Keep Appearing
- This is normal for development
- You need to accept the warning each session
- For production, use a proper SSL certificate

### Camera Not Working
- Grant permissions when prompted
- Check browser settings → Site permissions
- Some browsers block camera in insecure contexts

---

## Alternative: Use ngrok (Easy HTTPS Tunnel)

If the self-signed certificate is problematic, use ngrok:

```bash
# Install ngrok: https://ngrok.com/download
npm install -g ngrok

# Start dev server (terminal 1)
npm run dev

# In another terminal (terminal 2)
ngrok http 5173
```

Ngrok will give you a public HTTPS URL like: `https://abc123.ngrok.io`

Access this URL from your phone - no certificate warnings!

---

## Quick Reference

| Feature | Desktop | Phone (HTTP) | Phone (HTTPS) |
|---------|---------|--------------|---------------|
| 2D Measure Tool | ✅ Works | ✅ Works | ✅ Works |
| AR Measure - Camera Preview | ⚠️ Limited | ⚠️ Limited | ✅ Full |
| AR Measure - WebXR | ❌ No | ❌ No | ✅ Yes |
| Accurate AR Distances | ❌ No | ❌ No | ✅ Yes |
| World-Locked Lines | ❌ No | ❌ No | ✅ Yes |

---

## Production Deployment

For production, ensure your server has:
- Valid SSL certificate (Let's Encrypt, commercial CA)
- HTTPS enabled (usually automatic on platforms like Vercel, Netlify, etc.)
- Proper CORS headers for API

WebXR will work automatically on production HTTPS without any certificate warnings.
