# ⚠️ Failure Scenarios & Prevention Guide

This document lists all possible failure points in the WhatsApp Attendance workflow and how they are now handled.

---

## 🔴 CRITICAL FAILURE SCENARIOS

### 1. **Session Expiration** (WhatsApp logs out automatically)
**Symptoms:** `Session expired — WhatsApp logged out`
- **Cause:** WhatsApp session invalid or expired (sessions expire after days without use)
- **Detection:** Fixed in send.js - detects `DisconnectReason.loggedOut`
- **Fix Applied:** 
  - Validates `creds.json` exists before sending
  - Proper error message when session expires
  - User instructed to run `setup.js` and update session
- **Prevention:** Re-run setup.js monthly or when errors occur

### 2. **Corrupted Base64 Session File**
**Symptoms:** `Base64 decode error - session file may be corrupted`
- **Cause:** session_b64.txt corrupted or truncated during Git operations
- **Detection:** Workflow now validates base64 decoding
- **Fix Applied:** 
  ```bash
  if ! base64 -d < session_b64.txt > session.tar.gz 2>/dev/null; then
    echo "Base64 decode error"
    exit 1
  fi
  ```
- **Prevention:** Force-add file to Git with proper encoding

### 3. **Invalid Tar Archive**
**Symptoms:** `Invalid tar archive - session file corrupted`
- **Cause:** Tar extraction fails due to file corruption
- **Detection:** Workflow validates tar integrity before extraction
- **Fix Applied:**
  ```bash
  if ! tar -tzf session.tar.gz > /dev/null; then
    echo "Invalid tar archive"
    exit 1
  fi
  ```
- **Prevention:** Regenerate session_b64.txt if error persists

### 4. **Missing Critical Files**
**Symptoms:** `Missing creds.json - session extraction failed`
- **Cause:** Incomplete session extraction or corrupted backup
- **Detection:** Workflow checks for creds.json after extraction
- **Fix Applied:**
  ```bash
  if [ ! -f auth_info/creds.json ]; then
    echo "Missing creds.json"
    exit 1
  fi
  ```
- **Prevention:** Backup session files regularly

---

## 🟠 HIGH PRIORITY FAILURE SCENARIOS

### 5. **Missing GROUP_JID Secret**
**Symptoms:** `GROUP_JID secret is not set`
- **Cause:** GitHub secret not configured
- **Detection:** Workflow validates secret existence
- **Fix Applied:**
  ```bash
  if [ -z "${{ secrets.GROUP_JID }}" ]; then
    exit 1
  fi
  ```
- **Prevention:** Ensure `GROUP_JID` secret is set in GitHub repository settings

### 6. **Invalid GROUP_JID Format**
**Symptoms:** `Invalid GROUP_JID format: "xxx" (must contain @)`
- **Cause:** Wrong group ID format
- **Detection:** send.js validates format before use
- **Fix Applied:**
  ```javascript
  if (!jid.includes('@')) throw new Error('...');
  if (!jid.endsWith('@g.us') && !jid.endsWith('@s.whatsapp.net')) throw new Error('...');
  ```
- **Prevention:** Verify GROUP_JID ends with `@g.us` for groups, `@s.whatsapp.net` for individuals

### 7. **Baileys Version Incompatibility**
**Symptoms:** `Connection failed - version mismatch`
- **Cause:** Latest Baileys version breaking changes
- **Detection:** send.js catches version fetch failures
- **Fix Applied:**
  - Proper error handling for version fetch
  - Fallback logging on version display
- **Prevention:** Lock Baileys version in package.json if issues occur
  ```json
  "@whiskeysockets/baileys": "6.7.0"
  ```

### 8. **Network Connectivity Issues**
**Symptoms:** `Connection lost - network issue`
- **Cause:** GitHub runner network failure or WhatsApp API unreachable
- **Detection:** send.js detects DisconnectReason.connectionLost
- **Fix Applied:**
  ```javascript
  } else if (code === DisconnectReason.connectionLost) {
    reject(new Error('Connection lost - network issue'));
  ```
- **Prevention:** No retry logic yet - next workflow run will retry

### 9. **Authentication State Corruption**
**Symptoms:** `Missing creds.json - session may be corrupted`
- **Cause:** auth_info directory corrupted or partially restored
- **Detection:** send.js validates creds.json exists
- **Fix Applied:**
  ```javascript
  const hasCreds = files.includes('creds.json');
  if (!hasCreds) throw new Error('Missing creds.json - session may be corrupted');
  ```
- **Prevention:** Regenerate session if this occurs

### 10. **Timeout Issues**
**Symptoms:** `Process completed with exit code 124.` (GitHub error)
- **Cause:** WhatsApp connection takes longer than expected on GitHub runners
- **Detection:** send.js has 60-second timeout, workflow timeout command uses 60 seconds
- **Fix Applied:**
  - Increased from 45 seconds to 60 seconds for GitHub runner compatibility
  - Clear error message for timeout
  - Proper cleanup on timeout
  - Workflow timeout: 5 minutes total, 60 seconds for send step
- **Prevention:** GitHub runners are slower than local machines; 60 seconds is minimum safe timeout

---

## 🟡 MEDIUM PRIORITY FAILURE SCENARIOS

### 11. **Session File Too Small**
**Symptoms:** `session_b64.txt too small (XXX bytes)`
- **Cause:** Incomplete upload or truncated file
- **Detection:** Workflow checks file size > 1000 bytes
- **Fix Applied:**
  ```bash
  SIZE=$(wc -c < session_b64.txt)
  if [ "$SIZE" -lt 1000 ]; then
    echo "session_b64.txt too small"
    exit 1
  fi
  ```
- **Prevention:** Verify file size when updating session_b64.txt

### 12. **Missing Dependencies**
**Symptoms:** `Cannot find module '@whiskeysockets/baileys'`
- **Cause:** npm ci fails or incomplete installation
- **Detection:** Workflow runs npm ci and logs success
- **Fix Applied:**
  - Workflow uses `npm ci` (clean install)
  - Node.js 20 specified explicitly
  - npm cache enabled
- **Prevention:** Ensure package.json and package-lock.json are correct

### 13. **Node.js Version Incompatibility**
**Symptoms:** `Unexpected token` or `Cannot find module`
- **Cause:** GitHub runner using different Node version than expected
- **Detection:** Workflow explicitly sets Node 20
- **Fix Applied:**
  ```yaml
  - uses: actions/setup-node@v4
    with:
      node-version: '20'
  ```
- **Prevention:** Tested with Node v20.20.2

### 14. **Message Send Failure**
**Symptoms:** `[FAIL] Failed to send message: ...`
- **Cause:** sendMessage fails (group banned, rate limited, etc.)
- **Detection:** send.js catches sendMessage exceptions
- **Fix Applied:**
  ```javascript
  try {
    await sock.sendMessage(groupJid, { text: msg });
  } catch (e) {
    reject(new Error(`Failed to send message: ${e.message}`));
  }
  ```
- **Prevention:** Check if group still exists and bot is member

---

## 🟢 LOW PRIORITY / MINOR SCENARIOS

### 15. **Timezone Issues**
**Symptoms:** Message sent with wrong date
- **Cause:** Incorrect timezone calculation
- **Detection:** Message generated uses `Asia/Karachi` timezone
- **Fix Applied:**
  ```javascript
  new Date().toLocaleDateString('en-US', {
    timeZone: 'Asia/Karachi', day: 'numeric'
  })
  ```
- **Prevention:** Timezone hardcoded to Asia/Karachi

### 16. **Session Directory Already Exists**
**Symptoms:** Potential conflicts in restoration
- **Cause:** Partial cleanup from previous runs
- **Detection:** send.js checks if auth_info already populated
- **Fix Applied:**
  ```javascript
  if (fs.existsSync(AUTH_DIR) && fs.readdirSync(AUTH_DIR).length > 0) {
    return; // Already restored
  }
  ```
- **Prevention:** Automatic, no cleanup needed

### 17. **Cleanup Failures**
**Symptoms:** Temporary files left behind
- **Cause:** Cleanup code doesn't run on error
- **Detection:** Workflow is stateless per run
- **Fix Applied:**
  - Cleanup happens in workflow (rm session.tar.gz)
  - GitHub Actions cleans runner between runs
- **Prevention:** Always use runner cleanup

### 17b. **Exit Code 124 (Timeout Kill)**
**Symptoms:** `Process completed with exit code 124.`
- **Cause:** `timeout` command killed the process (45s timeout too short)
- **Detection:** Increased timeout to 60 seconds
- **Fix Applied:**
  - Workflow now uses `timeout 60` instead of `timeout 30`
  - send.js internal timeout increased from 45000ms to 60000ms
- **Prevention:** GitHub runners are slower; always test timeout values

### 18. **Logging Issues**
**Symptoms:** Cannot debug failures
- **Cause:** Insufficient logging
- **Detection:** All steps now have detailed logging
- **Fix Applied:**
  - send.js logs validation steps: `✓ Session files found: 101 files`
  - Workflow logs each step with timestamps
  - Error messages are clear and actionable
- **Prevention:** Check GitHub Actions logs for diagnostics

---

## 📋 MONITORING & DEBUGGING CHECKLIST

If workflow fails:

- [ ] Check GitHub Actions run logs: https://github.com/bilalwaheed24/WhatsApp-Attendance/actions
- [ ] Look for specific error in "Send message" step
- [ ] If `Session expired` → Run `node setup.js`, scan QR, update session_b64.txt
- [ ] If base64/tar error → Regenerate session_b64.txt
- [ ] If GROUP_JID error → Verify secret in GitHub settings
- [ ] If network error → Wait for next scheduled run (auto-retry)
- [ ] If timeout → Increase timeout in send.js line 45000 (milliseconds)
- [ ] If missing dependencies → Delete node_modules, run npm ci
- [ ] If still failing → Check https://github.com/WhiskeySockets/Baileys/issues

---

## 🔧 RECOVERY PROCEDURES

### Session Expired
```bash
cd ~/WhatsApp-Attendance
node setup.js
# Scan QR code with WhatsApp
# Then commit and push session_b64.txt
```

### Workflow Not Triggering
- Check cron schedule: `0 2 * * 1-5` = Mon-Fri 2:00 AM UTC (7:00 AM Pakistan)
- Wait for next scheduled time or click "Run workflow" in Actions tab

### Manual Trigger
- Go to: https://github.com/bilalwaheed24/WhatsApp-Attendance/actions
- Click "WhatsApp Attendance" workflow
- Click "Run workflow" button

---

## 📊 CURRENT SAFEGUARDS

| Scenario | Detection | Prevention |
|----------|-----------|-----------|
| Session Expiration | DisconnectReason | Regenerate setup.js |
| Base64 Corruption | Decode validation | Re-upload session file |
| Tar Corruption | Archive validation | Regenerate session backup |
| Missing creds.json | File check | Restore from backup |
| Invalid GROUP_JID | Format validation | Verify secret |
| Missing secret | Secret check | Configure GitHub secret |
| Network issues | Connection detection | Auto-retry next run |
| Timeout | Timer + cleanup | Increase timeout if needed |
| Missing deps | npm ci | Fix package.json |
| Node mismatch | Version spec | Node 20 guaranteed |

---

## ✅ TESTED & VERIFIED

- ✅ Local message sending works
- ✅ Base64 encoding/decoding verified
- ✅ Tar extraction validated
- ✅ GitHub Actions workflow succeeded
- ✅ Group JID format validated
- ✅ Session file integrity checked
- ✅ Error messages are clear
- ✅ Timeout handling works

---

**Last Updated:** 2026-07-02  
**Status:** All major failure points identified and mitigated
