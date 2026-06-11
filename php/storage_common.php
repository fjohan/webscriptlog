<?php

function wsl_test_input($data, $pattern) {
  $data = trim($data);
  $data = stripslashes($data);
  $data = htmlspecialchars($data, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

  if (preg_match($pattern, $data)) {
    die("Validation error.");
  }
  return $data;
}

function wsl_allowed_writer($id) {
  $passes = array("lu_test");
  foreach ($passes as $pass) {
    if (str_starts_with($id, $pass)) {
      return true;
    }
  }
  return false;
}

function wsl_allowed_reader($id) {
  $passes = array("lu_test");
  foreach ($passes as $pass) {
    if (str_starts_with($id, $pass) && str_ends_with($id, "admin")) {
      return true;
    }
  }
  return false;
}

function wsl_load_mysql_config() {
  $configPath = __DIR__ . '/fake.inc';
  if (!is_file($configPath)) {
    return false;
  }

  require_once $configPath;
  return defined('DB_HOST') && defined('DB_USER') && defined('DB_PASSWD') && defined('DB_NAME');
}

function wsl_file_store_dir() {
  $envDir = getenv('WEBSCRIPTLOG_FILE_STORE');
  if ($envDir !== false && $envDir !== '') {
    return $envDir;
  }
  return __DIR__ . '/logdata';
}

function wsl_ensure_file_store_dir() {
  $dir = wsl_file_store_dir();
  if (!is_dir($dir) && !mkdir($dir, 0775, true)) {
    die("Kunde inte skapa filarkiv.");
  }
  if (!is_writable($dir)) {
    die("Filarkivet är inte skrivbart.");
  }
  return $dir;
}

function wsl_safe_filename_part($value) {
  $safe = preg_replace('/[^A-Za-z0-9._-]+/', '_', $value);
  $safe = trim($safe, '._-');
  return $safe === '' ? 'record' : $safe;
}

function wsl_save_file_record($id, $response, $addr) {
  $dir = wsl_ensure_file_store_dir();
  $publishedOn = date('Y-m-d H:i:s');
  $micro = sprintf('%.6F', microtime(true));
  $uuid = bin2hex(random_bytes(16));
  $fileName = str_replace('.', '', $micro) . '_' . wsl_safe_filename_part($id) . '_' . $uuid . '.json';
  $path = $dir . '/' . $fileName;

  $record = array(
    'published_on' => $publishedOn,
    'addr' => $addr,
    'user' => $id,
    'uuid' => $uuid,
    'data' => $response
  );

  $json = json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  if ($json === false || file_put_contents($path, $json . "\n", LOCK_EX) === false) {
    die("Kunde inte spara till filarkiv.");
  }
}

function wsl_read_file_records($idPrefix, $startLimit, $endLimit) {
  $dir = wsl_file_store_dir();
  if (!is_dir($dir)) {
    return array();
  }

  $records = array();
  $files = glob($dir . '/*.json');
  if ($files === false) {
    return array();
  }

  foreach ($files as $file) {
    $json = file_get_contents($file);
    if ($json === false) {
      continue;
    }
    $record = json_decode($json, true);
    if (!is_array($record) || !isset($record['user']) || !isset($record['published_on']) || !isset($record['data'])) {
      continue;
    }
    if (!str_starts_with($record['user'], $idPrefix)) {
      continue;
    }
    $record['_file'] = basename($file);
    $records[] = $record;
  }

  usort($records, function($a, $b) {
    $timeCmp = strcmp($a['published_on'], $b['published_on']);
    if ($timeCmp !== 0) {
      return $timeCmp;
    }
    return strcmp($a['_file'], $b['_file']);
  });

  return array_slice($records, intval($startLimit), intval($endLimit));
}

?>
