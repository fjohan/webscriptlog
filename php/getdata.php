<?php

$myId = "";
$startLimit = "";
$endLimit = "";

require_once __DIR__ . '/storage_common.php';

if ($_SERVER["REQUEST_METHOD"] == "POST") {
  $myId = wsl_test_input($_POST['id'],'/[^a-z,_\-0-9]/i');
  $startLimit = wsl_test_input($_POST['startlimit'],'/[^0-9]/i');
  $endLimit = wsl_test_input($_POST['endlimit'],'/[^0-9]/i');
  if (!wsl_allowed_reader($myId)) {
    die("Error: Bad user");
  }
  $myId = str_replace("_admin", "", $myId);
} else {
  die("Error: Bad request");
}

if (!wsl_load_mysql_config()) {
  $records = wsl_read_file_records($myId, $startLimit, $endLimit);
  if (count($records) > 0) {
    $publOnIndex = intval($startLimit);
    foreach ($records as $row) {
      echo $row["published_on"]."\t".$row["user"]."\t".$row["data"]."\t".sprintf("%04d", $publOnIndex)."\n";
      $publOnIndex = $publOnIndex + 1;
    }
  } else {
    echo "0 results";
  }
  exit;
}

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

$sql = "SELECT published_on,user,data FROM " . $tblname . " WHERE user LIKE ? ORDER BY published_on LIMIT ?, ?";
$stmt = $conn->prepare($sql);
$likeId = $myId . "%";
$startLimitInt = intval($startLimit);
$endLimitInt = intval($endLimit);
$stmt->bind_param("sii", $likeId, $startLimitInt, $endLimitInt);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows > 0) {
  $publOnIndex = $startLimitInt;
  while($row = $result->fetch_assoc()) {
      echo $row["published_on"]."\t".$row["user"]."\t".$row["data"]."\t".sprintf("%04d", $publOnIndex)."\n";
      $publOnIndex = $publOnIndex + 1;
  }
} else {
  echo "0 results";
}
$stmt->close();
$conn->close();
?>
