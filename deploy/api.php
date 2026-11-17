<?php
declare(strict_types=1);
// Deployment replaces this path. The config and gateway key stay outside web root.
$configPath = '__PRIVATE_CONFIG_PATH__';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
function fail(int $status, string $message): never {
    http_response_code($status);
    echo json_encode(['detail' => $message]);
    exit;
}
if (!is_file($configPath)) { fail(503, 'The negotiation lab is being configured.'); }
$config = json_decode((string) file_get_contents($configPath), true);
if (!is_array($config) || empty($config['key']) || empty($config['backend'])) { fail(503, 'The lab is unavailable.'); }
$route = $_GET['r'] ?? '';
if (!is_string($route) || !preg_match('~^/api/(health|scenarios|sessions(?:/[a-f0-9]{32}(?:/(?:turn|stop))?)?)$~D', $route)) {
    fail(404, 'Not found.');
}
$method = $_SERVER['REQUEST_METHOD'];
if (!in_array($method, ['GET', 'POST', 'DELETE'], true)) { fail(405, 'Method not allowed.'); }
if ($method !== 'GET') {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '' && $origin !== $config['origin']) { fail(403, 'Origin denied.'); }
    if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 4096) { fail(413, 'Request too large.'); }
}
$body = file_get_contents('php://input', false, null, 0, 4097);
if ($body === false || strlen($body) > 4096) { fail(413, 'Request too large.'); }
$headers = [
    'Content-Type: application/json',
    'X-Demo-Gateway: ' . $config['key'],
    'X-Demo-Client: ' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown'),
];
$authorization = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
if (is_string($authorization) && preg_match('/^Bearer [A-Za-z0-9_-]{30,100}$/D', $authorization)) {
    $headers[] = 'Authorization: ' . $authorization;
}
$context = stream_context_create(['http' => [
    'method' => $method, 'header' => implode("\r\n", $headers), 'content' => $body,
    'ignore_errors' => true, 'follow_location' => 0, 'timeout' => 8,
]]);
$result = @file_get_contents($config['backend'] . $route, false, $context);
if ($result === false) { fail(503, 'The local negotiation service is offline. Please try again shortly.'); }
$status = 502;
if (preg_match('/^HTTP\/\S+\s+(\d+)/', $http_response_header[0] ?? '', $match)) { $status = (int) $match[1]; }
http_response_code($status);
foreach ($http_response_header as $line) {
    if (preg_match('/^Retry-After:/i', $line)) { header($line); }
}
echo $result;
