<?php

use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

if (!function_exists('deleteFile')) {
  function deleteFile($url, $publicId)
  {
    try {
      if (str_starts_with($url, 'https://r2.classfundz.com')) {
        delete_from_cloudfare($publicId);
      }
      if (str_starts_with($url, 'https://res.cloudinary.com')) {
        deleteFromCloudinary($publicId);
      }
      if (str_starts_with('public/', $url)) {
        if (!empty($url) && Storage::exists($url)) {
          Storage::delete($url);
        }
      }
      return true;
    } catch (\Exception $e) {
      Log::error('Cloud Delete Exception: ' . $e->getMessage());
      return false;
    }
  }
}
if (!function_exists('deleteFromCloudinary')) {
  function deleteFromCloudinary($publicId)
  {
    if (empty($publicId))
      return true;
    $cloudName = env('CLOUDINARY_CLOUD_NAME');
    $apiKey = env('CLOUDINARY_API_KEY');
    $apiSecret = env('CLOUDINARY_API_SECRET');
    $timestamp = time();
    try {
      $signature = hash('sha256', "invalidate=" . true . "&public_id={$publicId}&timestamp={$timestamp}{$apiSecret}");
      $response = Http::asForm()->post("https://api.cloudinary.com/v1_1/{$cloudName}/image/destroy", [
        'public_id' => $publicId,
        'api_key' => $apiKey,
        'timestamp' => $timestamp,
        'signature' => $signature,
        'invalidate' => true
      ]);
      if ($response->successful() && $response['result'] === 'ok') {
        return true;
      } else {
        return false;
      }
    } catch (\Exception $e) {
      \Log::error('Cloudinary Delete Exception: ' . $e->getMessage());
      return false;
    }
  }
}

if (!function_exists('uploadToCloudinary')) {
  function uploadToCloudinary($file, $folder)
  {
    $cloudName = env('CLOUDINARY_CLOUD_NAME');
    $apiKey = env('CLOUDINARY_API_KEY');
    $apiSecret = env('CLOUDINARY_API_SECRET');
    $timestamp = time();
    $folder = "classfundz/users/$folder";
    $payload_to_sign = "folder={$folder}&timestamp={$timestamp}{$apiSecret}";
    $signature = sha1($payload_to_sign);
    try {
      $response = Http::asMultipart()
        ->post("https://api.cloudinary.com/v1_1/{$cloudName}/auto/upload", [
          'file' => $file,
          'api_key' => $apiKey,
          'timestamp' => $timestamp,
          'signature' => $signature,
          'folder' => $folder
        ]);
      $result = $response->json();
      if (isset($result['secure_url'])) {
        return [
          'url' => $result['secure_url'],
          'public_id' => $result['public_id']
        ];
      }
      Log::error('Cloudinary Upload Error: ' . json_encode($result));
      return null;

    } catch (\Exception $e) {
      Log::error('Cloudinary Upload Exception: ' . $e->getMessage());
      return null;
    }
  }
}

if (!function_exists('upload')) {
  function upload($file, $path, $ext = null)
  {
    $storage = env('STORAGE', 'cloudfare');
    $tmp = $file->store("public/data/{$path}");
    // check if directory exists
    if (!Storage::exists("public/data/{$path}")) {
      Storage::makeDirectory("public/data/{$path}");
    }
    if ($storage == 'local') {
      return $tmp;
    }
    $cd = $storage == 'cloudinary' ? uploadToCloudinary(load_file($tmp), $path) : upload_to_cloudfare(load_file($tmp), $path, $ext);
    if (null !== $cd) {
      if (!empty($cd) && Storage::exists($tmp)) {
        Storage::delete($tmp);
      }
      return $cd['url'];
    } else {
      return null;
    }
    // return $tmp;
  }
}

if (!function_exists('load_file')) {
  function load_file($path): string|null
  {
    if (!str_starts_with($path, 'public/')) {
      return $path;
    }
    return (server_name() == '0.0.0.0') ? Storage::url($path) : url("storage/app/private/$path");
  }
}

if (!function_exists('server_name')) {
  function server_name(): string
  {
    return $_SERVER['SERVER_NAME'];
  }
}

if (!function_exists('generate_aws_signature')) {
  function generate_aws_signature($method, $url, $headers, $body)
  {
    $accessKey = env('R2_ACCESS_KEY_ID');
    $secretKey = env('R2_SECRET_ACCESS_KEY');
    $region = env('R2_REGION', 'auto');
    $service = 's3';

    $timestamp = gmdate('Ymd\THis\Z');
    $date = substr($timestamp, 0, 8);

    $parsedUrl = parse_url($url);
    $canonical_uri = $parsedUrl['path'] ?? '/';

    $canonical_querystring = $parsedUrl['query'] ?? '';

    ksort($headers);

    $signed_headers = [];
    $canonical_headers = '';
    foreach ($headers as $key => $value) {
      $lowercase_key = strtolower($key);
      $signed_headers[] = $lowercase_key;
      $canonical_headers .= "{$lowercase_key}:{$value}\n";
    }

    $signed_headers_string = implode(';', $signed_headers);

    $payload_hash = hash('sha256', $body);

    $canonical_request = implode("\n", [
      $method,
      $canonical_uri,
      $canonical_querystring,
      $canonical_headers,
      $signed_headers_string,
      $payload_hash
    ]);
    $credential_scope = implode('/', [$date, $region, $service, 'aws4_request']);
    $string_to_sign = implode("\n", [
      'AWS4-HMAC-SHA256',
      $timestamp,
      $credential_scope,
      hash('sha256', $canonical_request)
    ]);
    $k_date = hash_hmac('sha256', $date, "AWS4{$secretKey}", true);
    $k_region = hash_hmac('sha256', $region, $k_date, true);
    $k_service = hash_hmac('sha256', $service, $k_region, true);
    $k_signing = hash_hmac('sha256', 'aws4_request', $k_service, true);
    $signature = hash_hmac('sha256', $string_to_sign, $k_signing);
    $authorization = "AWS4-HMAC-SHA256 "
      . "Credential={$accessKey}/{$credential_scope}, "
      . "SignedHeaders={$signed_headers_string}, "
      . "Signature={$signature}";
    return array_merge($headers, [
      'Authorization' => $authorization,
      'x-amz-date' => $timestamp,
      'x-amz-content-sha256' => $payload_hash
    ]);
  }

}

if (!function_exists('upload_to_cloudfare')) {
  function upload_to_cloudfare($filePath, $key, $ext)
  {
    try {
      $name = Str::uuid() . ".$ext";
      $key = "uploads/$key/$name";
      $bucketName = env('R2_BUCKET_NAME');
      $endpoint = env('R2_ENDPOINT');
      $url = "{$endpoint}/{$bucketName}/{$key}";
      $fileResponse = Http::withoutVerifying()->get($filePath);
      if (!$fileResponse->successful()) {
        throw new Exception("Failed to fetch file from URL");
      }
      $fileContents = $fileResponse->body();
      $contentType = $fileResponse->header('Content-Type') ?: 'image/png';
      $contentLength = strlen($fileContents);
      $headers = [
        'Host' => parse_url($endpoint, PHP_URL_HOST),
        'Content-Length' => $contentLength,
        'Content-Type' => $contentType ?: 'image/png',
        'x-amz-acl' => 'public-read',
      ];
      $signedHeaders = generate_aws_signature('PUT', $url, $headers, $fileContents);
      $response = Http::withHeaders($signedHeaders)
        ->withBody($fileContents, $headers['Content-Type'] ?? null)
        ->put($url);
      if ($response->successful()) {
        $url = "https://cloud.pilox.com.ng/$key";
        return [
          'url' => $url,
          'public_id' => $key
        ];
      }
      throw new Exception("Failed to upload image. Response: " . $response->body());
    } catch (Exception $e) {
      Log::error('Upload to Cloudflare failed: ' . $e->getMessage(), [
        'file_path' => $filePath,
        'key' => $key,
        'error' => $e->getMessage()
      ]);
      return null;
    }
  }
}

if (!function_exists('delete_from_cloudfare')) {
  function delete_from_cloudfare($key)
  {
    try {
      $bucketName = env('R2_BUCKET_NAME');
      $endpoint = env('R2_ENDPOINT');
      $url = "{$endpoint}/{$bucketName}/{$key}";
      $headers = [
        'Host' => parse_url($endpoint, PHP_URL_HOST),
      ];
      $signedHeaders = generate_aws_signature('DELETE', $url, $headers, '');
      $response = Http::withHeaders($signedHeaders)->delete($url);
      if ($response->successful()) {
        return "Image deleted successfully.";
      }
      throw new Exception("Failed to delete image. {$response->body()}");
    } catch (\Exception $e) {
      Log::error('Cloudfare Delete Exception: ' . $e->getMessage());
      return false;
    }
  }
}