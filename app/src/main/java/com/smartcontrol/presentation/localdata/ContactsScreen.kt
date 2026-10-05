package com.smartcontrol.presentation.localdata
import android.Manifest
import android.content.pm.PackageManager
import android.provider.ContactsContract
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
fun ContactsScreen(onBack:()->Unit){
 val context=LocalContext.current; var contacts by remember{mutableStateOf<List<String>>(emptyList())}
 val permission=rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()){if(it) loadContacts(context){contacts=it}}
 Column(Modifier.fillMaxSize().padding(16.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
  Text("Contacts",style=MaterialTheme.typography.headlineSmall)
  Text("Local-only viewer. Contacts are not uploaded or remotely collected.")
  Button(onClick={if(ContextCompat.checkSelfPermission(context,Manifest.permission.READ_CONTACTS)==PackageManager.PERMISSION_GRANTED) loadContacts(context){contacts=it} else permission.launch(Manifest.permission.READ_CONTACTS)},modifier=Modifier.fillMaxWidth()){Text("Load contacts")}
  Text("Count: "+contacts.size)
  LazyColumn(Modifier.weight(1f)){items(contacts){Text(it,Modifier.padding(8.dp))}}
  OutlinedButton(onClick=onBack,modifier=Modifier.fillMaxWidth()){Text("Back")}
 }
}
private fun loadContacts(context:android.content.Context,onLoaded:(List<String>)->Unit){
 val result=mutableListOf<String>()
 runCatching{context.contentResolver.query(ContactsContract.Contacts.CONTENT_URI,arrayOf(ContactsContract.Contacts.DISPLAY_NAME_PRIMARY),null,null,ContactsContract.Contacts.DISPLAY_NAME_PRIMARY+" ASC")?.use{c->while(c.moveToNext())result+=c.getString(0).orEmpty().ifBlank{"(Unnamed)"}}}
 onLoaded(result)
}