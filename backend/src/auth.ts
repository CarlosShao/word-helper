import express from 'express';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { run, get, all } from './db';

const router = express.Router();

function generateToken(): string {
  return crypto.randomBytes(32).toString('base64');
}

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function getUserIdFromToken(token: string): Promise<number | null> {
  console.log('[DEBUG-GET-USER-ID] Looking up token in sessions');
  const session = await get('SELECT user_id FROM user_sessions WHERE token = $1 AND expires_at > NOW()', [token]);
  console.log('[DEBUG-GET-USER-ID] Session found:', session ? `user_id=${session.user_id}` : 'none');
  return session?.user_id || null;
}

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('[DEBUG-LOGIN] Login attempt for email:', email);
    
    if (!email || !password) {
      return res.status(400).json({ success: false, message: '请填写邮箱和密码' });
    }
    
    const hashedPassword = hashPassword(password);
    const user = await get('SELECT id, username FROM users WHERE email = $1 AND password = $2', [email, hashedPassword]);
    console.log('[DEBUG-LOGIN] User found:', user ? `id=${user.id}, username=${user.username}` : 'none');
    
    if (!user) {
      return res.status(401).json({ success: false, message: '邮箱或密码错误' });
    }
    
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    console.log('[DEBUG-LOGIN] Generated token:', token.substring(0, 20) + '...');
    
    await run('INSERT INTO user_sessions (user_id, token, expires_at) VALUES ($1, $2, $3)', [user.id, token, expiresAt]);
    console.log('[DEBUG-LOGIN] Session inserted for user:', user.id);
    
    res.json({ success: true, token, username: user.username });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: '登录失败' });
  }
});

router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ success: false, message: '请填写所有字段' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: '密码长度至少6位' });
    }
    
    const existingUser = await get('SELECT id FROM users WHERE email = $1 OR username = $2', [email, username]);
    if (existingUser) {
      return res.status(400).json({ success: false, message: '邮箱或用户名已存在' });
    }
    
    const hashedPassword = hashPassword(password);
    const result = await run(
      'INSERT INTO users (username, email, password, email_verified) VALUES ($1, $2, $3, 0) RETURNING id',
      [username, email, hashedPassword]
    );
    
    res.json({ success: true, message: '注册成功，请登录' });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: '注册失败' });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ success: false, message: '请填写邮箱' });
    }
    
    const user = await get('SELECT id, username FROM users WHERE email = $1', [email]);
    if (!user) {
      return res.json({ success: true, message: '如果该邮箱存在，已发送重置链接' });
    }
    
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000);
    
    await run('INSERT INTO password_resets (email, token, expires_at) VALUES ($1, $2, $3)', [email, token, expiresAt]);
    
    const resetLink = `${req.protocol}://${req.get('host')}/reset-password/${token}`;
    
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.qq.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
    
    const mailOptions = {
      from: process.env.SMTP_FROM || 'noreply@example.com',
      to: email,
      subject: 'Word Helper - 重置密码',
      html: `
        <p>您好 ${user.username}，</p>
        <p>您请求重置密码，请点击以下链接完成重置：</p>
        <p><a href="${resetLink}" style="display: inline-block; padding: 12px 24px; background: #667eea; color: white; text-decoration: none; border-radius: 4px;">重置密码</a></p>
        <p>链接有效期为1小时。</p>
        <p>如果不是您本人操作，请忽略此邮件。</p>
        <p>Word Helper 团队</p>
      `
    };
    
    await transporter.sendMail(mailOptions);
    
    res.json({ success: true, message: '重置链接已发送到您的邮箱' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, message: '发送失败，请稍后重试' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    
    if (!token || !password) {
      return res.status(400).json({ success: false, message: '参数错误' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: '密码长度至少6位' });
    }
    
    const resetRecord = await get(
      'SELECT * FROM password_resets WHERE token = $1 AND used = 0 AND expires_at > NOW()',
      [token]
    );
    
    if (!resetRecord) {
      return res.status(400).json({ success: false, message: '重置链接无效或已过期' });
    }
    
    const hashedPassword = hashPassword(password);
    await run('UPDATE users SET password = $1, updated_at = NOW() WHERE email = $2', 
      [hashedPassword, resetRecord.email]);
    await run('UPDATE password_resets SET used = 1 WHERE token = $1', [token]);
    
    res.json({ success: true, message: '密码重置成功' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: '重置失败' });
  }
});

router.get('/validate', async (req, res) => {
  const authHeader = req.headers.authorization;
  console.log('[DEBUG-VALIDATE] ====== TOKEN VALIDATION ======');
  console.log('[DEBUG-VALIDATE] Auth header present:', !!authHeader);
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('[DEBUG-VALIDATE] No valid auth header - returning 401');
    return res.status(401).json({ success: false, error: '未授权' });
  }
  
  const token = authHeader.substring(7);
  console.log('[DEBUG-VALIDATE] Token received:', token ? token.substring(0, 30) + '...' : 'EMPTY');
  console.log('[DEBUG-VALIDATE] Calling getUserIdFromToken...');
  
  const userId = await getUserIdFromToken(token);
  console.log('[DEBUG-VALIDATE] getUserIdFromToken returned:', userId);
  
  if (!userId) {
    console.log('[DEBUG-VALIDATE] No userId found for token - returning 401');
    return res.status(401).json({ success: false, error: '无效的token' });
  }
  
  const user = await get('SELECT id, username, email FROM users WHERE id = $1', [userId]);
  console.log('[DEBUG-VALIDATE] User from DB:', user ? `id=${user.id}, username=${user.username}` : 'NOT FOUND');
  
  if (user) {
    console.log('[DEBUG-VALIDATE] SUCCESS - returning user data');
    res.json({ success: true, username: user.username, userId: user.id });
  } else {
    console.log('[DEBUG-VALIDATE] User not found in DB - returning 404');
    res.status(404).json({ success: false, error: '用户不存在' });
  }
});

router.get('/profile', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: '未授权' });
  }
  
  const token = authHeader.substring(7);
  const userId = await getUserIdFromToken(token);
  
  if (!userId) {
    return res.status(401).json({ success: false, error: '无效的token' });
  }

  const user = await get('SELECT id, username, email, avatar_url, provider, created_at FROM users WHERE id = $1', [userId]);
  if (user) {
    res.json({ success: true, user });
  } else {
    res.status(404).json({ success: false, error: '用户不存在' });
  }
});

router.post('/logout', async (req, res) => {
  const authHeader = req.headers.authorization;
  console.log('[DEBUG-LOGOUT] ====== LOGOUT ======');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('[DEBUG-LOGOUT] No auth header - returning success anyway');
    return res.json({ success: true });
  }
  
  const token = authHeader.substring(7);
  console.log('[DEBUG-LOGOUT] Token:', token.substring(0, 30) + '...');
  
  try {
    const deleted = await run('DELETE FROM user_sessions WHERE token = $1', [token]);
    console.log('[DEBUG-LOGOUT] Session deleted successfully');
    res.json({ success: true });
  } catch (error) {
    console.error('[DEBUG-LOGOUT] Error deleting session:', error);
    res.json({ success: true });
  }
});

router.get('/github', (req, res) => {
  console.log('[DEBUG-GITHUB] ====== GITHUB LOGIN START ======');
  const githubClientId = process.env.GITHUB_CLIENT_ID;
  console.log('[DEBUG-GITHUB] Client ID configured:', !!githubClientId);
  
  if (!githubClientId) {
    console.log('[DEBUG-GITHUB] GitHub Client ID not configured!');
    return res.status(500).json({ success: false, message: 'GitHub登录未配置' });
  }
  
  const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/github/callback`;
  console.log('[DEBUG-GITHUB] Redirect URI:', redirectUri);
  
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${githubClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read:user,user:email`;
  console.log('[DEBUG-GITHUB] Redirecting to GitHub OAuth');
  res.redirect(githubAuthUrl);
});

router.get('/github/callback', async (req, res) => {
  console.log('[DEBUG-GITHUB-CB] ====== GITHUB CALLBACK ======');
  console.log('[DEBUG-GITHUB-CB] Query params:', JSON.stringify(req.query));
  
  const { code, error } = req.query;
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  console.log('[DEBUG-GITHUB-CB] Base URL:', baseUrl);
  
  if (error) {
    console.log('[DEBUG-GITHUB-CB] GitHub returned error:', error);
    return res.redirect(`${baseUrl}/login?error=${error}`);
  }
  
  if (!code) {
    console.log('[DEBUG-GITHUB-CB] No code received!');
    return res.redirect(`${baseUrl}/login?error=missing_code`);
  }
  
  console.log('[DEBUG-GITHUB-CB] Authorization code received:', code.substring(0, 20) + '...');
  
  try {
    const githubClientId = process.env.GITHUB_CLIENT_ID;
    const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;
    console.log('[DEBUG-GITHUB-CB] Client ID configured:', !!githubClientId);
    console.log('[DEBUG-GITHUB-CB] Client Secret configured:', !!githubClientSecret);
    
    console.log('[DEBUG-GITHUB-CB] Requesting GitHub access token...');
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        client_id: githubClientId,
        client_secret: githubClientSecret,
        code
      })
    });
    
    const tokenData = await tokenResponse.json();
    console.log('[DEBUG-GITHUB-CB] GitHub token response:', JSON.stringify(tokenData));
    
    if (!tokenData.access_token) {
      console.log('[DEBUG-GITHUB-CB] No access token in response!');
      return res.redirect(`${baseUrl}/login?error=github_auth_failed`);
    }
    
    console.log('[DEBUG-GITHUB-CB] Access token received, fetching user info...');
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Accept': 'application/json'
      }
    });

    const githubUser = await userResponse.json();
    console.log('[DEBUG-GITHUB-CB] GitHub user data:', JSON.stringify(githubUser));

    console.log('[DEBUG-GITHUB-CB] Looking for existing user with provider=github, provider_id=', githubUser.id);
    let user = await get('SELECT * FROM users WHERE provider = $1 AND provider_id = $2', 
      ['github', githubUser.id.toString()]);
    console.log('[DEBUG-GITHUB-CB] Existing user found:', !!user);

    if (!user) {
      console.log('[DEBUG-GITHUB-CB] Creating new user...');
      const userEmail = githubUser.email || `${githubUser.login}@github.placeholder`;
      const result = await run(
        'INSERT INTO users (username, email, password, provider, provider_id, avatar_url, email_verified) VALUES ($1, $2, $3, $4, $5, $6, 1) RETURNING id',
        [githubUser.login, userEmail, '', 'github', githubUser.id.toString(), githubUser.avatar_url]
      );
      console.log('[DEBUG-GITHUB-CB] New user created with ID:', result?.id);
      user = { id: result?.id, username: githubUser.login };
    } else {
      console.log('[DEBUG-GITHUB-CB] Existing user ID:', user.id, 'username:', user.username);
    }

    const token = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    console.log('[DEBUG-GITHUB-CB] Generated app token:', token.substring(0, 30) + '...');
    
    console.log('[DEBUG-GITHUB-CB] Inserting session for user:', user.id);
    await run('INSERT INTO user_sessions (user_id, token, expires_at) VALUES ($1, $2, $3)', 
      [user.id, token, expiresAt]);
    console.log('[DEBUG-GITHUB-CB] Session inserted successfully');

    const redirectUrl = `${baseUrl}/?github_token=${token}&username=${encodeURIComponent(user.username)}`;
    console.log('[DEBUG-GITHUB-CB] Redirecting to:', redirectUrl.substring(0, 100) + '...');
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('[DEBUG-GITHUB-CB] ERROR in callback:', error);
    res.redirect(`${baseUrl}/login?error=github_callback_failed`);
  }
});

export { router as authRouter, getUserIdFromToken };
