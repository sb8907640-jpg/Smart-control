package com.smartcontrol.presentation.localdata
import android.app.AppOpsManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.provider.Settings
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
@Composable
fun AppUsageScreen(onBack:()->Unit){
 val context=LocalContext.current; var rows by remember{mutableStateOf<List<String>>(emptyList())}
 fun hasAccess():Boolean{val ops=context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager;return ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS,android.os.Process.myUid(),context.packageName)==AppOpsManager.MODE_ALLOWED}
 fun load(){val now=System.currentTimeMillis();val stats=(context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager).queryUsageStats(UsageStatsManager.INTERVAL_DAILY,now-86400000L,now);rows=stats.filter{it.totalTimeInForeground>0}.sortedByDescending{it.totalTimeInForeground}.map{it.packageName+" • "+(it.totalTimeInForeground/1000)+"s"}}
 Column(Modifier.fillMaxSize().padding(16.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
  Text("App Usage",style=MaterialTheme.typography.headlineSmall)
  Text("Local-only usage statistics. Nothing is uploaded.")
  Button(onClick={if(hasAccess())load()else context.startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))},modifier=Modifier.fillMaxWidth()){Text(if(hasAccess())"Refresh usage" else "Grant Usage Access in Settings")}
  LazyColumn(Modifier.weight(1f)){items(rows){Text(it,Modifier.padding(8.dp))}}
  OutlinedButton(onClick=onBack,modifier=Modifier.fillMaxWidth()){Text("Back")}
 }
}