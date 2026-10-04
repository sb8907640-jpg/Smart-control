package com.smartcontrol
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.smartcontrol.presentation.auth.AuthScreen
import dagger.hilt.android.AndroidEntryPoint
@AndroidEntryPoint
class MainActivity:ComponentActivity(){
 override fun onCreate(savedInstanceState:Bundle?){super.onCreate(savedInstanceState);setContent{AuthScreen()}}
}
