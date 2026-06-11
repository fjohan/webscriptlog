<?php

$myId = $myKrl = $myResponse = "";

function test_input($data, $pattern) {
  $data = trim($data);
  $data = stripslashes($data);
  $data = htmlspecialchars($data);

  if(preg_match($pattern, $data))
  {
    die("Validation error.");
  }
  return $data;
}

if ($_SERVER["REQUEST_METHOD"] == "POST") {
  $myId = test_input($_POST['id'],'/[^a-z,_\-0-9]/i');
  $passed = 0;
  $passes = array("lu_test");
  foreach ($passes as $pass) {
    if (str_starts_with($myId, $pass)) {
      $passed = 1;
    }
  }
  if ($passed == 0) {
    die("Kan inte spara centralt, felaktig användare.");
  }

  $myResponse = test_input($_POST['response'],'/[^,0-9]/');
} else {
  die("Felaktigt anrop.");
}

require_once realpath(__DIR__ . 'fake.inc');
$servername = DB_HOST;
$username = DB_USER;
$password = DB_PASSWD;
$dbname = DB_NAME;
$tblname = "records";

$myAddr = $_SERVER['REMOTE_ADDR'];

try {
  $conn = new PDO("mysql:host=$servername;dbname=$dbname", $username, $password);
  // set the PDO error mode to exception
  $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$sql = <<<EOD
INSERT INTO $tblname
(published_on, addr, user, uuid, data)
VALUES
(NOW(),'$myAddr','$myId', UUID(), '$myResponse')
EOD;

  // use exec() because no results are returned
  $rows = $conn->exec($sql);
  //echo "sql query executed successfully, " . $rows . " rows affected." . "<br>";
  echo "Sparat centralt.\n";
} catch(PDOException $e) {
  echo $sql . "<br>" . $e->getMessage();
  //echo "Kunde inte spara centralt.\n";
}

$conn = null;
?>
