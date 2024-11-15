for (const userId of userIds) {
    // Step 1: Send Email Verification
    try {
      await axios.post(
        `https://${AUTH0_DOMAIN}/api/v2/jobs/verification-email`,
        {
          user_id: userId,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
  
      console.log(`Verification email sent to user: ${userId}`);
  
      // Step 2: Send Password Reset Email
      const passwordResetResponse = await axios.post(
        `https://${AUTH0_DOMAIN}/api/v2/tickets/password-change`,
        {
          user_id: userId,
          result_url: 'https://your-app-domain.com/reset-successful', // Redirect URL after password reset
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
  
      console.log(
        `Password reset email sent to user: ${userId}, ticket URL: ${passwordResetResponse.data.ticket}`
      );
    } catch (error) {
      console.error(`Error processing user: ${userId}`, error.response?.data || error.message);
    }
  }
  