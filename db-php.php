<?php
session_start();

$baseDir = __DIR__; // Set the initial directory

if (isset($_GET['dir'])) {
    $dir = $_GET['dir'];
    $_SESSION['current_dir'] = realpath($baseDir . '/' . $dir);
} elseif (isset($_SESSION['current_dir'])) {
    $dir = $_SESSION['current_dir'];
} else {
    $dir = $baseDir;
    $_SESSION['current_dir'] = $baseDir;
}

// Security check to prevent directory traversal
$dir = realpath($dir);

// Handle file actions
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action'])) {
    $action = $_POST['action'];

    if ($action === 'createFile' && isset($_POST['filename'])) {
        $filename = $_POST['filename'];
        $filePath = $dir . '/' . $filename;

        if (!file_exists($filePath)) {
            file_put_contents($filePath, '');
            echo "<p class='success'>File '$filename' created successfully!</p>";
        } else {
            echo "<p class='error'>File '$filename' already exists!</p>";
        }
    } elseif ($action === 'saveFile' && isset($_POST['fileContent']) && isset($_POST['filename'])) {
        $filename = $_POST['filename'];
        $filePath = $dir . '/' . $filename;

        file_put_contents($filePath, $_POST['fileContent']);
        echo "<p class='success'>File '$filename' saved successfully!</p>";
    } elseif ($action === 'deleteFile' && isset($_POST['filename'])) {
        $filename = $_POST['filename'];
        $filePath = $dir . '/' . $filename;

        if (file_exists($filePath)) {
            unlink($filePath);
            echo "<p class='success'>File '$filename' deleted successfully!</p>";
        } else {
            echo "<p class='error'>File '$filename' not found!</p>";
        }
    }
}

// Get the list of files and directories in the current directory
$files = scandir($dir);

// Display the current path and navigation links
echo "<style>
        body {
            font-family: 'Arial', sans-serif;
            background-color: #f5f5f5;
            margin: 0;
            padding: 0;
        }

        .container {
            max-width: 800px;
            margin: 20px auto;
            background-color: #fff;
            padding: 20px;
            border-radius: 5px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        }

        .path {
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 15px;
        }

        .nav a {
            color: #3498db;
            text-decoration: none;
            margin-right: 10px;
        }

        ul {
            list-style-type: none;
            padding: 0;
            margin: 0;
        }

        li {
            margin-bottom: 10px;
        }

        .create-file-form {
            margin-top: 15px;
        }

        .file-actions {
            margin-top: 10px;
        }

        .file-editor {
            width: 100%;
            height: 300px;
            margin-top: 15px;
            padding: 10px;
            font-family: 'Courier New', monospace;
        }

        .success {
            color: #27ae60;
        }

        .error {
            color: #c0392b;
        }
      </style>";

echo "<div class='container'>";
echo "<p class='path'>Current Path: $dir</p>";
echo "<p class='nav'><a href='?dir=" . dirname($dir) . "'>Up one level</a></p>";

// List the files and directories
echo "<ul>";
foreach ($files as $file) {
    $path = $dir . '/' . $file;

    if ($file == '.' || $file == '..') {
        continue;
    }

    echo "<li>";

    if (is_dir($path)) {
        echo "[DIR] <a href='?dir=$path'>$file</a>";
    } else {
        echo "<a href='?action=view&file=$file&dir=$dir'>$file</a> | ";
        echo "<a href='?action=edit&file=$file&dir=$dir'>Edit</a> | ";
        echo "<form method='post' action='?dir=$dir' style='display:inline;'>";
        echo "<input type='hidden' name='filename' value='$file'>";
        echo "<input type='hidden' name='action' value='deleteFile'>";
        echo "<button type='submit' onclick='return confirm(\"Are you sure you want to delete $file?\")'>Delete</button>";
        echo "</form>";
    }

    echo "</li>";
}
echo "</ul>";

// Form to create a new file
echo "<form method='post' action='?dir=$dir' class='create-file-form'>";
echo "<label for='filename'>Create New File: </label>";
echo "<input type='text' name='filename' required>";
echo "<input type='hidden' name='action' value='createFile'>";
echo "<button type='submit'>Create</button>";
echo "</form>";

// Display file content for viewing or editing
if (isset($_GET['action']) && ($_GET['action'] === 'view' || $_GET['action'] === 'edit') && isset($_GET['file'])) {
    $file = $_GET['file'];
    $filePath = $dir . '/' . $file;

    echo "<h2>{$file}</h2>";

    if ($_GET['action'] === 'view') {
        echo "<pre>" . htmlspecialchars(file_get_contents($filePath)) . "</pre>";
    } elseif ($_GET['action'] === 'edit') {
        $fileContent = file_get_contents($filePath);
        echo "<form method='post' action='?dir=$dir'>";
        echo "<textarea class='file-editor' name='fileContent'>$fileContent</textarea><br>";
        echo "<input type='hidden' name='filename' value='$file'>";
        echo "<input type='hidden' name='action' value='saveFile'>";
        echo "<div class='file-actions'><button type='submit'>Save Changes</button></div>";
        echo "</form>";
    }
}

echo "</div>";
?>