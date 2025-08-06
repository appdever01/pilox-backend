<?php

declare(strict_types=1);

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;
use MongoDB\Laravel\Relations\BelongsTo;

class User extends Model
{
    protected $connection = 'mongodb';

    public function getCurrencyAttribute()
    {
        return Currency::find($this->currency);
    }
}
