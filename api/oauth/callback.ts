import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, error, state } = req.query;

  // Handle OAuth error
  if (error) {
    console.error('OAuth error:', error);
    return res.redirect(302, `https://${req.headers.host}/api/oauth/success?error=${encodeURIComponent(error as string)}`);
  }

  // Handle missing code
  if (!code) {
    console.error('Missing authorization code');
    return res.redirect(302, `https://${req.headers.host}/api/oauth/success?error=missing_code`);
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.SLACK_CLIENT_ID || '',
        client_secret: process.env.SLACK_CLIENT_SECRET || '',
        code: code as string,
        redirect_uri: `https://${req.headers.host}/api/oauth/callback`,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.ok) {
      console.error('Token exchange failed:', tokenData.error);
      return res.redirect(302, `https://${req.headers.host}/api/oauth/success?error=${encodeURIComponent(tokenData.error)}`);
    }

    // Store token in database or session
    // TODO: Add database storage logic here
    console.log('OAuth success:', {
      team_id: tokenData.team?.id,
      team_name: tokenData.team?.name,
      user_id: tokenData.authed_user?.id,
    });

    // Redirect to success page
    return res.redirect(302, `https://${req.headers.host}/api/oauth/success`);

  } catch (error) {
    console.error('OAuth callback error:', error);
    return res.redirect(302, `https://${req.headers.host}/api/oauth/success?error=server_error`);
  }
}