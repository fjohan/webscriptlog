<?php

$myId = $myKrl = $myResponse = "";

require_once __DIR__ . '/storage_common.php';

if ($_SERVER["REQUEST_METHOD"] == "POST") {
  $myId = wsl_test_input($_POST['id'],'/[^a-z,_\-0-9]/i');
  if (!wsl_allowed_writer($myId)) {
    die("Kan inte spara centralt, felaktig användare.");
  }

  $myResponse = wsl_test_input($_POST['response'],'/[^,0-9]/');
} else {
  die("Felaktigt anrop.");
}

$tblname = "records";

$myAddr = $_SERVER['REMOTE_ADDR'];

if (!wsl_load_mysql_config()) {
  wsl_save_file_record($myId, $myResponse, $myAddr);
  echo "Sparat centralt (filarkiv).\n";
  exit;
}

$servername = DB_HOST;
$username = DB_USER;
$password = DB_PASSWD;
$dbname = DB_NAME;

try {
  $conn = new PDO("mysql:host=$servername;dbname=$dbname", $username, $password);
  $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

  $sql = "INSERT INTO $tblname (published_on, addr, user, uuid, data) VALUES (NOW(), :addr, :user, UUID(), :data)";
  $stmt = $conn->prepare($sql);
  $stmt->execute(array(':addr' => $myAddr, ':user' => $myId, ':data' => $myResponse));

  echo "Sparat centralt.\n";
} catch(PDOException $e) {
  echo "Kunde inte spara centralt.<br>" . $e->getMessage();
}

$conn = null;
?>
