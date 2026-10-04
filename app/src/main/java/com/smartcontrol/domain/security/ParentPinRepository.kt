package com.smartcontrol.domain.security
interface ParentPinRepository { suspend fun verifyPin(pin:String):Boolean; suspend fun changePin(newPin:String):Result<Unit> }