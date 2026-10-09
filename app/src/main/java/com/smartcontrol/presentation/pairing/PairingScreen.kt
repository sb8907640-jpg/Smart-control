package com.smartcontrol.presentation.pairing

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.google.firebase.auth.FirebaseAuth
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter

@Composable
fun PairingScreen(
    onBack: () -> Unit,
    initialToken: String? = null,
    viewModel: PairingViewModel = hiltViewModel()
) {
    val pairing by viewModel.pairing.collectAsState()
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current
    val currentUid = FirebaseAuth.getInstance().currentUser?.uid.orEmpty()
    val deepLinkToken = remember(initialToken, context) {
        (initialToken ?: (context as? Activity)?.intent?.data?.getQueryParameter("token"))
            ?.trim()
            .orEmpty()
    }
    var token by remember(deepLinkToken) { mutableStateOf(deepLinkToken) }
    val pairingUrl = state.code?.let { "smartcontrol://pair?token=${Uri.encode(it.token)}" }
    val qrBitmap = remember(pairingUrl) {
        pairingUrl?.let { url ->
            runCatching {
                val matrix = QRCodeWriter().encode(url, BarcodeFormat.QR_CODE, 512, 512)
                Bitmap.createBitmap(512, 512, Bitmap.Config.ARGB_8888).apply {
                    for (x in 0 until 512) {
                        for (y in 0 until 512) {
                            setPixel(x, y, if (matrix[x, y]) Color.BLACK else Color.WHITE)
                        }
                    }
                }
            }.getOrNull()
        }
    }

    Column(
        modifier = Modifier.padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("Device Pairing", style = MaterialTheme.typography.headlineSmall)
        Text("Generate a temporary pairing token or open a shared smartcontrol://pair link. Pairing still requires an explicit user action.")

        if (pairing != null) {
            Text(
                if (pairing!!.controllerUid == currentUid) "Paired device: " + pairing!!.uid
                else "Paired controller: " + pairing!!.controllerUid
            )
            OutlinedButton(onClick = viewModel::unpair, modifier = Modifier.fillMaxWidth()) {
                Text("Unpair device")
            }
        } else {
            Button(
                onClick = viewModel::generateCode,
                enabled = !state.busy,
                modifier = Modifier.fillMaxWidth()
            ) { Text("Create pairing token") }

            state.code?.let { code ->
                val shareText = pairingUrl.orEmpty()
                Text("Scan the QR Code or share the pairing link with the intended device. Pairing codes expire according to the assigned plan.")
                qrBitmap?.let { bitmap ->
                    Image(
                        bitmap = bitmap.asImageBitmap(),
                        contentDescription = "Pairing QR code",
                        modifier = Modifier.size(220.dp)
                    )
                }
                Text(code.token, style = MaterialTheme.typography.titleMedium)
                Button(onClick = {
                    val send = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_TEXT, shareText)
                    }
                    context.startActivity(Intent.createChooser(send, "Share pairing link"))
                }, modifier = Modifier.fillMaxWidth()) { Text("Share link") }
                OutlinedButton(onClick = {
                    val send = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_TEXT, shareText)
                        setPackage("com.whatsapp")
                    }
                    runCatching { context.startActivity(send) }.onFailure {
                        Toast.makeText(context, "WhatsApp is not available. Use Share link instead.", Toast.LENGTH_LONG).show()
                    }
                }, modifier = Modifier.fillMaxWidth()) { Text("WhatsApp") }
                OutlinedButton(onClick = {
                    val sms = Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:")).apply {
                        putExtra("sms_body", shareText)
                    }
                    runCatching { context.startActivity(sms) }.onFailure {
                        Toast.makeText(context, "SMS app is not available.", Toast.LENGTH_LONG).show()
                    }
                }, modifier = Modifier.fillMaxWidth()) { Text("SMS") }
                OutlinedButton(onClick = {
                    val email = Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:")).apply {
                        putExtra(Intent.EXTRA_SUBJECT, "Device pairing link")
                        putExtra(Intent.EXTRA_TEXT, shareText)
                    }
                    runCatching { context.startActivity(email) }.onFailure {
                        Toast.makeText(context, "Email app is not available.", Toast.LENGTH_LONG).show()
                    }
                }, modifier = Modifier.fillMaxWidth()) { Text("Email") }
                OutlinedButton(onClick = {
                    val clipboard = context.getSystemService(ClipboardManager::class.java)
                    clipboard?.setPrimaryClip(ClipData.newPlainText("Pairing link", shareText))
                    Toast.makeText(context, "Pairing link copied", Toast.LENGTH_SHORT).show()
                }, modifier = Modifier.fillMaxWidth()) { Text("Copy") }
            }

            OutlinedTextField(
                value = token,
                onValueChange = { token = it },
                label = { Text("Pairing token") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )
            Button(
                onClick = { viewModel.claimCode(token) },
                enabled = token.isNotBlank() && !state.busy,
                modifier = Modifier.fillMaxWidth()
            ) { Text("Pair this controller") }
        }

        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Back") }
    }
}
