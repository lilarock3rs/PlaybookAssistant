import { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const { error } = req.query;
  
  const title = error ? 'Installation Failed' : 'Successfully Installed';
  const message = error 
    ? `Installation failed: ${error}` 
    : 'Your Slack app has been successfully installed! This window will close automatically.';
  
  const bgColor = error ? '#ff4444' : '#28a745';
  const textColor = error ? '#ffffff' : '#ffffff';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 0;
            background: ${bgColor};
            color: ${textColor};
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            text-align: center;
        }
        .container {
            max-width: 500px;
            padding: 40px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            backdrop-filter: blur(10px);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        }
        h1 {
            font-size: 2.5rem;
            margin-bottom: 20px;
            font-weight: 600;
        }
        p {
            font-size: 1.2rem;
            margin-bottom: 30px;
            line-height: 1.5;
        }
        .checkmark {
            font-size: 4rem;
            margin-bottom: 20px;
            animation: bounce 2s infinite;
        }
        .error-mark {
            font-size: 4rem;
            margin-bottom: 20px;
        }
        @keyframes bounce {
            0%, 20%, 50%, 80%, 100% {
                transform: translateY(0);
            }
            40% {
                transform: translateY(-10px);
            }
            60% {
                transform: translateY(-5px);
            }
        }
        .countdown {
            font-size: 0.9rem;
            opacity: 0.8;
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="${error ? 'error-mark' : 'checkmark'}">
            ${error ? '❌' : '✅'}
        </div>
        <h1>${title}</h1>
        <p>${message}</p>
        ${!error ? '<div class="countdown">This window will close in <span id="countdown">5</span> seconds...</div>' : ''}
    </div>

    <script>
        ${!error ? `
        let countdown = 5;
        const countdownElement = document.getElementById('countdown');
        
        const timer = setInterval(() => {
            countdown--;
            if (countdownElement) {
                countdownElement.textContent = countdown;
            }
            
            if (countdown <= 0) {
                clearInterval(timer);
                window.close();
                
                // Fallback for browsers that don't allow window.close()
                setTimeout(() => {
                    window.history.back();
                }, 1000);
            }
        }, 1000);
        ` : ''}
    </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(html);
}