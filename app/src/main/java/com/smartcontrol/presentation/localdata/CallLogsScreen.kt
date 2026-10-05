package com.smartcontrol.presentation.localdata
import android.Manifest
import android.content.pm.PackageManager
import android.provider.CallLog
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
@Composable
fun CallLogsScreen(onBack:()->Unit){
 val context=LocalContext.current; var calls by remember{mutableStateOf<List<String>>(emptyList())}
 val permission=rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()){if(it)loadCalls(context){calls=it}}
 Column(Modifier.fillMaxSize().padding(16.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
  Text("Call Logs",style=MaterialTheme.typography.headlineSmall)
  Text("Local-only, read-only call history. No call logs are uploaded.")
  Button(onClick={if(ContextCompat.checkSelfPermission(context,Manifest.permission.READ_CALL_LOG)==PackageManager.PERMISSION_GRANTED)loadCalls(context){calls=it}else permission.launch(Manifest.permission.READ_CALL_LOG)},modifier=Modifier.fillMaxWidth()){Text("Load call history")}
  LazyColumn(Modifier.weight(1f)){items(calls){Text(it,Modifier.padding(8.dp))}}
  OutlinedButton(onClick=onBack,modifier=Modifier.fillMaxWidth()){Text("Back")}
 }
}
private fun loadCalls(context:android.content.Context,onLoaded:(List<String>)->Unit){
 val result=mutableListOf<String>()
 runCatching{context.contentResolver.query(CallLog.Calls.CONTENT_URI,arrayOf(CallLog.Calls.NUMBER,CallLog.Calls.TYPE,CallLog.Calls.DATE,CallLog.Calls.DURATION),null,null,CallLog.Calls.DATE+" DESC")?.use{c->while(c.moveToNext())result+=c.getString(0).orEmpty()+" • type="+c.getInt(1)+" • "+c.getLong(2)+" • "+c.getLong(3)+"s"}}
 onLoaded(result)
}