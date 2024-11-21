app.post('/upload-users', async (req, res) => {
  try {
    // Step 1: Get Moodle Token and User Data
    const moodleToken = await getMoodleToken();
    const userData = JSON.parse(await fs.promises.readFile('user.json', 'utf8'));

    // Step 2: Prepare parameters for the Moodle API
    const params = {
      wstoken: moodleToken,
      wsfunction: "local_wssassoon_create_enrol_users",
    };

    // Use dynamic indexing to avoid overwriting parameters
    userData.forEach((user) => {
      params['users[0][username]'] = user.email;
      params['users[0][firstname]'] = user.given_name;
      params['users[0][lastname]'] = user.family_name;
      params['users[0][email]'] = user.email;
      params['users[0][auth]'] = "mo_saml";
    });

    const apiUrl = 'https://sassoon.edvantalabs.com/webservice/rest/server.php?moodlewsrestformat=json';

    // Step 3: Make the POST request to Moodle API
    const moodleResponse = await axios.post(apiUrl, null, { params });
    console.log('Moodle response:', moodleResponse.data);

    // Step 4: Get Auth0 Management Token
    const token = await getManagementToken();

    // Step 5: Prepare FormData for Auth0 User Import
    const form = new FormData();
    form.append('users', fs.createReadStream('user.json'));
    form.append('connection_id', 'con_mIZ8kSMehWSugTcY');

    // Step 6: Initiate the User Import Job on Auth0
    const response = await axios.post(
      `https://${AUTH0_DOMAIN}/api/v2/jobs/users-imports`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const jobId = response.data.id;
    console.log('User Import Job ID:', jobId);

    // Step 7: Poll for Job Completion (Optional, depends on your use case)
    // Implement polling or delay mechanism if you need to wait for job completion

    // Step 8: Retrieve All Users
    const allUsers = [];
    let page = 0;
    const perPage = 100; // Maximum allowed by Auth0

    while (true) {
      const userResponse = await axios.get(
        `https://${AUTH0_DOMAIN}/api/v2/users`,
        {
          params: { page, per_page: perPage },
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const users = userResponse.data;
      allUsers.push(...users);

      if (users.length < perPage) break;
      page++;
    }

    console.log('All Users:', allUsers);

    // Step 9: Filter Matched Users by Emails
    const matchedUsers = await filterUsersByEmails(allUsers, 'user.json');
    const userIds = matchedUsers.map(user => user.user_id);
    console.log('Matched User IDs:', userIds);

    // Step 10: Create Nodemailer Transporter for Email Sending
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER, // Use environment variable for email
        pass: process.env.EMAIL_PASS, // Use environment variable for email password
      },
    });

    // Step 11: Send Email Verification to Matched Users
    for (const user of matchedUsers) {
      const userEmail = user.email;
      const userId = user.user_id;

      try {
        // Step 1: Send Email Verification
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: userEmail,
          subject: 'Verification Email',
          text: 'Please verify your email address by clicking the link below.',
          html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Verify Your Account</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                margin: 0;
                padding: 0;
                background-color: #f4f4f4;
              }
              .container {
                max-width: 600px;
                margin: 20px auto;
                background: #ffffff;
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
              }
              .header {
                background-color: #222222;
                color: #ffffff;
                text-align: center;
                padding: 20px;
              }
              .header img {
                max-height: 40px;
              }
              .header h1 {
                margin: 10px 0;
                font-size: 24px;
              }
              .content {
                padding: 20px;
                color: #333333;
              }
              .content p {
                margin: 10px 0;
                line-height: 1.6;
              }
              .verify-btn {
                display: block;
                text-align: center;
                margin: 20px auto;
              }
              .verify-btn a {
                background-color: #f55a2c;
                color: #ffffff;
                text-decoration: none;
                padding: 10px 20px;
                border-radius: 5px;
                font-size: 16px;
              }
              .footer {
                font-size: 12px;
                text-align: center;
                color: #999999;
                padding: 20px;
                background: #f9f9f9;
              }
              .footer a {
                color: #999999;
                text-decoration: none;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <img src="https://auth0.com/favicon.ico" alt="Auth0 Logo">
                <h1>Verify Your Account</h1>
              </div>
              <div class="content">
                <p><strong>Verify Link:</strong> <a href="http://localhost:3000/verified-users/${userId}">Click here to verify</a></p>
                <div class="verify-btn">
                  <a href="http://localhost:3000/verified-users/${userId}">VERIFY YOUR ACCOUNT</a>
                </div>
                <p>If you are having any issues with your account, please don't hesitate to contact us by replying to this mail.</p>
                <p>Thanks!</p>
              </div>
              <div class="footer">
                <p>You’re receiving this email because you have an account in dev-245l7o4d2ki6i2rq. If you are not sure why you’re receiving this, please <a href="mailto:support@example.com">contact us</a>.</p>
              </div>
            </div>
          </body>
          </html>`
        };

        await transporter.sendMail(mailOptions);
        console.log(`Verification email sent to: ${userEmail}`);
      } catch (error) {
        console.error(`Error processing user: ${userEmail}`, error.response?.data || error.message);
      }
    }

    // Respond with success
    res.status(200).json({
      message: 'User import and retrieval successful',
      importedUserIds: userIds,
      moodleUsers: moodleResponse.data,
    });

  } catch (error) {
    console.error('Error uploading users:', error);
    res.status(500).json({
      message: 'Failed to upload users',
      error: error.response ? error.response.data : error.message,
    });
  }
});