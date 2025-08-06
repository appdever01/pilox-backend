<?php

declare(strict_types=1);

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Models\User;
use Illuminate\Support\Str;

// Route::get('/users', function (Request $request) {
//     $user = User::where('email', 'uvietoboretreasure@gmail.com')->first();
//     return $user->currency()->code;
// });

Route::post('/upload/{key}', function (Request $request, $key) {
    if ($key !== env('UPLOAD_SECRET_KEY')) {
        return response()->json(['message' => 'Unauthorized'], 401);
    }
    $file = $request->file('file');
    if (!$file) {
        return response()->json(['message' => 'File is required'], 400);
    }
    $ext = $request->file('file')->getClientOriginalExtension();
    $upload = upload($file, Str::uuid(), $ext);
    if (!$upload) {
        return response()->json(['message' => 'File upload failed'], 500);
    }
    return response()->json(['message' => 'File uploaded successfully', 'url' => $upload], 200);
});
