package com.smartcontrol.presentation.localdata
import android.Manifest
import android.content.pm.PackageManager
import android.provider.Telephony
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
fun SmsScreen(onBack:()->Unit){
 val context=LocalContext.current; var messages by remember{mutableStateOf<List<String>>(emptyList())}
 val permission=rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()){if(it) loadSms(context){messages=it}}
 Column(Modifier.fillMaxSize().padding(16.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
  Text("SMS",style=MaterialTheme.typography.headlineSmall)
  Text("Local-only, read-only SMS viewer. No SMS is uploaded or remotely collected.")
  Button(onClick={if(ContextCompat.checkSelfPermission(context,Manifest.permission.READ_SMS)==PackageManager.PERMISSION_GRANTED)loadSms(context){messages=it}else permission.launch(Manifest.permission.READ_SMS)},modifier=Modifier.fillMaxWidth()){Text("Load SMS")}
  LazyColumn(Modifier.weight(1f)){items(messages){Text(it,Modifier.padding(8.dp))}}
  OutlinedButton(onClick=onBack,modifier=Modifier.fillMaxWidth()){Text("Back")}
 }
}
private fun loadSms(context:android.content.Context,onLoaded:(List<String>)->Unit){
 val result=mutableListOf<String>()
 runCatching{context.contentResolver.query(Telephony.Sms.CONTENT_URI,arrayOf(Telephony.Sms.ADDRESS,Telephony.Sms.DATE,Telephony.Sms.BODY),null,null,Telephony.Sms.DATE+" DESC")?.use{c->while(c.moveToNext())result+=c.getString(0).orEmpty()+" • "+c.getLong(1)+"\n"+c.getString(2).orEmpty()}}
 onLoaded(result)
}