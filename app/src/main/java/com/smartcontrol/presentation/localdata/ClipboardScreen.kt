package com.smartcontrol.presentation.localdata
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
@Composable
fun ClipboardScreen(onBack:()->Unit){
 val context=LocalContext.current;var text by remember{mutableStateOf("")}
 Column(Modifier.fillMaxSize().padding(16.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
  Text("Clipboard",style=MaterialTheme.typography.headlineSmall)
  Text("Visible local clipboard viewer. It does not monitor the clipboard in the background or sync it remotely.")
  Button(onClick={val cm=context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager;text=cm.primaryClip?.getItemAt(0)?.coerceToText(context)?.toString().orEmpty()},modifier=Modifier.fillMaxWidth()){Text("Read current clipboard")}
  OutlinedTextField(text=text,onValueChange={text=it},modifier=Modifier.fillMaxWidth(),minLines=4)
  Button(onClick={val cm=context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager;cm.setPrimaryClip(ClipData.newPlainText("Smart Control",text))},modifier=Modifier.fillMaxWidth()){Text("Copy text to clipboard")}
  OutlinedButton(onClick=onBack,modifier=Modifier.fillMaxWidth()){Text("Back")}
 }
}