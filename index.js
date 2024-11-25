const express = require('express');
const axios = require('axios');
const app = express();
const fs = require('fs').promises;
const csvWriter = require('csv-writer').createObjectCsvWriter;
require('dotenv').config();

const { 
  readJSONFile,
  getManagementToken,
  getMoodleToken,
  createMoodleUsers,
  importUsersToAuth0,
  oauthUserLoginTokenApi,
  sendDataToBoundlessAPI,
  sendVerificationEmails,
  filterUsersByEmails
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

     // Import users to Auth0
    const importedauth0Data = await importUsersToAuth0(auth0Token, 'user.json');



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

    const matchedUsers = await filterUsersByEmails(allUsers, 'user.json');

    const fileData = await fs.readFile('user.json', 'utf8');
    const usersFromJson = JSON.parse(fileData);
  
    // Update the `user_id` in usersFromJson by matching with `matchedUsers`
    usersFromJson.forEach((jsonUser) => {
      const matchedUser = matchedUsers.find((user) => user.email === jsonUser.email);
      if (matchedUser) {
        jsonUser.user_id = matchedUser.user_id; // Append the `user_id`
      }
    });

    // Write the updated data back to the user.json file
    await fs.writeFile('user.json', JSON.stringify(usersFromJson, null, 2));


    const passwordResetLinks = [];
    for (const user of matchedUsers) {
      const passwordResetResponse = await axios.post(
        `https://${process.env.AUTH0_DOMAIN}/api/v2/tickets/password-change`,
        { user_id: user.user_id },
        { headers: { Authorization: `Bearer ${auth0Token}` } }
      );

      const passwordResetLink = passwordResetResponse.data.ticket;
      console.log('user data:: ', user)
      passwordResetLinks.push({
        auth0Id: user.user_id,
        email: user.email,
        firstname: user.given_name || 'N/A',
        lastname: user.family_name || 'N/A',
        password_reset_link: passwordResetLink,
      });

      // Update email verification status
      await axios.patch(
        `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${user.user_id}`,
        { email_verified: true },
        { headers: { Authorization: `Bearer ${auth0Token}` } }
      );
    }

    // Write data to CSV
    const csvFilePath = 'users_with_reset_links.csv';
    const csvWriterInstance = csvWriter({
      path: csvFilePath,
      header: [
        { id: 'auth0Id', title: 'Auth0 Id' },
        { id: 'email', title: 'Email' },
        { id: 'firstname', title: 'Firstname' },
        { id: 'lastname', title: 'Lastname' },
        { id: 'password_reset_link', title: 'Password Reset Link' },
      ],
    });

    await csvWriterInstance.writeRecords(passwordResetLinks);

    let salesForceResponse; // Declare the variable

    // Send verification emails
    // await sendVerificationEmails(matchedUsers);

    res.status(200).json({
      message: 'User upload successful',
      moodleUsers,
      importedauth0Data,
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
      const url = `https://${process.env.AUTH0_DOMAIN}/api/v2/users`;
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
