const express = require('express');
const axios = require('axios');
const app = express();
require('dotenv').config();

const { 
  readJSONFile,
  getManagementToken,
  getMoodleToken,
  createMoodleUsers,
  importUsersToAuth0,
  oauthUserLoginTokenApi,
  sendDataToBoundlessAPI,
  sendVerificationEmails
} = require('./service');
// Main route to handle user upload
app.post('/upload-users', async (req, res) => {
  try {
    // Fetch tokens
    const moodleToken = await getMoodleToken();
    const auth0Token = await getManagementToken();

    // Read user data
    const userData = await readJSONFile('user.json');

    // Create users on Moodle
    const moodleUsers = await createMoodleUsers(moodleToken, userData);

    console.log('moodle users::',moodleUsers);

     // Import users to Auth0
    const jobId = await importUsersToAuth0(auth0Token, 'user.json');
    console.log('Auth0 Import Job ID:', jobId);

    // Fetch all users from Auth0
    const allUsers = [];
    let page = 0;
    const perPage = 100; // Maximum allowed by Auth0

    while (true) {
      const userResponse = await axios.get(
        `https://${process.env.AUTH0_DOMAIN}/api/v2/users`,
        {
          params: { page, per_page: perPage },
          headers: { Authorization: `Bearer ${auth0Token}` },
        }
      );

      const users = userResponse.data;
      allUsers.push(...users);

      if (users.length < perPage) break;
      page++;
    }



    const oauthUserLoginToken = await oauthUserLoginTokenApi();
    console.log('oauthUserLoginToken::', oauthUserLoginToken); 

    const matchedUsers = await filterUsersByEmails(allUsers, 'user.json');

    let salesForceResponse; // Declare the variable

// Send data to Boundless API
for (const user of matchedUsers) {
  console.log('oauthUserLoginToken.access_token', oauthUserLoginToken);
  if (oauthUserLoginToken[0].username === user.email) {
    // If the username and email match, send the access token to Boundless API
    salesForceResponse = await sendDataToBoundlessAPI(oauthUserLoginToken[0].access_token, user, userData);
    break; // Optional: If you want to stop once a match is found
  }
}


    // Send verification emails
    await sendVerificationEmails(matchedUsers);

    res.status(200).json({
      message: 'User upload successful',
      moodleUsers,
      matchedUsers,
      salesForceResponse
    });
  } catch (error) {
    console.error('Error in /upload-users:', error);
    res.status(500).json({ message: 'Error uploading users', error: error.message });
  }
});



// Endpoint to check the status of a user import job
app.get('/verified-users/:userId', async (req, res) => {
  const userId = req.params.userId; // Access userId from URL parameters
  
  const verifyTemplate = (redirectUrl) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Verified</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      font-family: Arial, sans-serif;
      background-color: #ffffff;
    }
    .container {
      text-align: center;
      padding: 20px;
    }
    .circle {
      width: 80px;
      height: 80px;
      border: 4px solid #4CAF50;
      border-radius: 50%;
      display: flex;
      justify-content: center;
      align-items: center;
      margin: 0 auto 20px auto;
    }
    .checkmark {
      color: #4CAF50;
      font-size: 36px;
      font-weight: bold;
    }
    .title {
      font-size: 24px;
      color: #333333;
      font-weight: bold;
      margin-bottom: 10px;
    }
    .message {
      font-size: 16px;
      color: #666666;
    }
  </style>
  <script>
    setTimeout(() => {
      window.location.href = "${redirectUrl}";
    }, 5000); // Redirect after 5 seconds
  </script>
</head>
<body>
  <div class="container">
    <div class="circle">
      <span class="checkmark">&#10003;</span>
    </div>
    <div class="title">Account Verified!</div>
    <div class="message">Your account has been verified successfully.</div>
  </div>
</body>
</html>
`;

  try {
    // Get the management token
    const token = await getManagementToken();

    // Send the request to Auth0 to generate a password reset ticket
    const passwordResetResponse = await axios.post(
      `https://${AUTH0_DOMAIN}/api/v2/tickets/password-change`,
      { user_id: userId },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    // Update user's email verification status
    await axios.patch(
      `https://${AUTH0_DOMAIN}/api/v2/users/${userId}`,
      { email_verified: true },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    // Extract the reset ticket URL
    const passwordResetUrl = `${passwordResetResponse.data.ticket}`;

    // Send the verify template with redirection
    res.send(verifyTemplate(passwordResetUrl));
  } catch (error) {
    console.error('Error generating password reset ticket:', error);
    res.status(500).json({
      message: 'Failed to generate password reset URL',
      error: error.response ? error.response.data : error.message,
    });
  }
});


app.get('/get-all-users', async (req, res) => {
    try {
      const token = await getManagementToken();
  
      // Make the request to Auth0 to get all users
      const url = `https://${AUTH0_DOMAIN}/api/v2/users`;
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
  
      // Send the response back to the client with the user data
      res.status(200).json({
        message: 'Users fetched successfully',
        users: response.data,
      });
    } catch (error) {
      console.error('Error fetching users:', error.response ? error.response.data : error.message);
      res.status(500).json({
        message: 'Failed to fetch users',
        error: error.response ? error.response.data : error.message,
      });
    }
  });  

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
