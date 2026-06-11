<?php

$myId = "";
$startLimit = "";
$endLimit = "";

function test_input($data,$pattern) {
  $data = trim($data);
  $data = stripslashes($data);
  $data = htmlspecialchars($data);

  if(preg_match($pattern, $data))
  {
    die($data . "<br>Error: Validation error.");
  }
  return $data;
}

if ($_SERVER["REQUEST_METHOD"] == "POST") {
  $myId = test_input($_POST['id'],'/[^a-z,_\-0-9]/i');
  $startLimit = test_input($_POST['startlimit'],'/[^0-9]/i');
  $endLimit = test_input($_POST['endlimit'],'/[^0-9]/i');
  $passed = 0;
  $passes = array("lu_test");
  foreach ($passes as $pass) {
    if (str_starts_with($myId, $pass) && str_ends_with($myId, "admin")) {
      $passed = 1;
    }
  }
  if ($passed == 0) {
    die("Error: Bad user");
  }
  $myId = str_replace("_admin", "", $myId);
} else {
  die("Error: Bad request");
}

require_once realpath(__DIR__ . 'fake.inc');
$servername = DB_HOST;
$username = DB_USER;
$password = DB_PASSWD;
$dbname = DB_NAME;
$tblname = "records";


// Create connection
$conn = new mysqli($servername, $username, $password, $dbname);
// Check connection
if ($conn->connect_error) {
  die("Connection failed: " . $conn->connect_error);
}

$sql = "SELECT published_on,user,data FROM " . $tblname . " WHERE user LIKE '" . $myId . "%' ORDER BY published_on LIMIT " . $startLimit . "," . $endLimit;
$result = $conn->query($sql);

if ($result->num_rows > 0) {
  $publOnIndex = $startLimit;
  while($row = $result->fetch_assoc()) {
      echo $row["published_on"]."\t".$row["user"]."\t".$row["data"]."\t".sprintf("%04d", $publOnIndex)."\n";
      $publOnIndex = $publOnIndex + 1;
  }
} else {
  echo "0 results";
}
$conn->close();
?>
