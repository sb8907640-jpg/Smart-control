package com.smartcontrol
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.*
import androidx.hilt.navigation.compose.hiltViewModel
import com.smartcontrol.presentation.auth.AuthScreen
import com.smartcontrol.presentation.auth.AuthViewModel
import com.smartcontrol.presentation.session.SessionScreen
import com.smartcontrol.presentation.settings.SettingsScreen
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity:ComponentActivity(){
 override fun onCreate(savedInstanceState:Bundle?){super.onCreate(savedInstanceState);setContent{
  var signedIn by remember{mutableStateOf(false)}
  var settings by remember{mutableStateOf(false)}
  if(!signedIn) AuthScreen(onAuthenticated={signedIn=true})
  else if(settings) SettingsScreen(onBack={settings=false},onEndSession={settings=false})
  else SessionScreen(onSettings={settings=true})
 }}
}