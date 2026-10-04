package com.smartcontrol
import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.*
import com.smartcontrol.presentation.auth.AuthScreen
import com.smartcontrol.presentation.session.SessionScreen
import com.smartcontrol.presentation.settings.SettingsScreen
import com.smartcontrol.service.FamilySafetyService
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity:ComponentActivity(){
 private val notificationPermission=registerForActivityResult(ActivityResultContracts.RequestPermission()){FamilySafetyService.start(this)}
 override fun onCreate(savedInstanceState:Bundle?){
  super.onCreate(savedInstanceState)
  setContent{
   var signedIn by remember{mutableStateOf(false)}
   var settings by remember{mutableStateOf(false)}
   if(!signedIn) AuthScreen(onAuthenticated={signedIn=true})
   else {
    LaunchedEffect(Unit){
     if(Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED)
      notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
     else FamilySafetyService.start(this@MainActivity)
    }
    if(settings) SettingsScreen(onBack={settings=false},onEndSession={settings=false})
    else SessionScreen(onSettings={settings=true})
   }
  }
 }
}