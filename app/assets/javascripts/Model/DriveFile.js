function DriveFile(id, options){
  var self = this;
  this.uid = options["uid"] || "DriveFile"
  this.install_binder()
  this.set("id", id)
  this.set("folder_id", options["folder_id"])
  this.set("loaded", options["loaded"])
  this.set("title", "")
  this.set("title_saved", "")
  this.set("data", "")
  this.set("data_saved", "")
  this.set("_post_update_callback")
  if(this.id){
    this.persisted = true
    this.get_file_data()
  }
}

DriveFile.prototype.install_binder = function(){
  var self = this
  var binder = new DataBinder( this.uid )

  this._binder = binder

  // Subscribe to the PubSub
  binder.on( this.uid + ":change", function( evt, attr_name, new_val, initiator ) {
    if ( initiator !== self ) {
      self.set( attr_name, new_val );
    }
  });
}

// The attribute setter publish changes using the DataBinder PubSub
DriveFile.prototype.set = function( attr_name, val ) {
  this[ attr_name ] = val;
  this._binder.trigger( this.uid + ":change", [ attr_name, val, this ] );
}

DriveFile.prototype.get = function( attr_name ) {
  return this.attributes[ attr_name ];
}



DriveFile.prototype.get_file_data = function(){
  var self = this;
  var fields = "downloadUrl,id,mimeType,title,fileSize"
  var request = gapi.client.drive.files.get({
    'fileId': this.id
  });
  request.execute(function(resp) {
    self.set("mime_type", resp.mimeType)
    self.set("title", resp.title)
    self.set("title_saved", self.title)

    $.ajax({
      url : resp.downloadUrl,
      headers : { 'Authorization' : 'Bearer '+gapi.auth.getToken().access_token },
      complete : function(data, status){
        self.set("data", data.responseText)
        self.set("data_saved", self.data)
        self.loaded()
      },
    })
  });
}

DriveFile.prototype.update = function(new_revision, callback) {
  var self = this;
  this._post_update_callback = callback
  if (this.did_content_change() ){
    self.update_data(new_revision, function(){
      self._post_update_callback()
    })
  }
  else{
    callback()
  }

}

DriveFile.prototype.update_metadata = function(callback){
  var self = this
  if (this.title != this.title_saved){
    var body = {'title': this.title };
    var request = gapi.client.drive.files.patch({
      'fileId': this.id,
      'resource': body
    });
    request.execute(function(){
      self.set("title_saved", self.title)
      callback()
    })
  }
  else{
    callback()
  }
}

DriveFile.prototype.update_data = function(new_revision, callback){
  var self = this

  const boundary = '-------314159265358979323846';
  const delimiter = "\r\n--" + boundary + "\r\n";
  const close_delim = "\r\n--" + boundary + "--";

  var data_blob = new Blob([this.data])

  var reader = new FileReader();
  reader.readAsBinaryString(data_blob);
  reader.onload = function(e) {
    // after the || should compute mime type automagically
    var contentType = self.mime_type || 'application/octet-stream';

    var base64Data = btoa(reader.result);
    var multipartRequestBody =
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify({fileId : self.id, title : self.title}) +
        delimiter +
        'Content-Type: ' + contentType + '\r\n' +
        'Content-Transfer-Encoding: base64\r\n' +
        '\r\n' +
        base64Data +
        close_delim;

    var url = this.persisted ? '/upload/drive/v2/files/' + self.id : '/upload/drive/v2/files/'
    var method = this.persisted ? "PUT" : "POST"

    var request = gapi.client.request({
        'path': url,
        'method': method,
        'params': { uploadType : 'multipart', alt : 'json', newRevision : new_revision, fileId : self.id},
        'headers': {
          'Content-Type': 'multipart/mixed; boundary="' + boundary + '"'
        },
        'body': multipartRequestBody});
    if (!callback) {
      callback = function(file) {
        console.log(file)
      };
    }
    request.execute(function(file){
      //set id if it's not persisted and set persisted
      if(!self.persisted){
        self.set("persisted", true)
        self.set("id", file.id)
      }
      self.set("title_saved", self.title)
      self.set("data_saved", self.data)
      callback()
    });
  }
}

DriveFile.prototype.did_content_change = function(){
  var self = this;
  return (this.data != this.data_saved || this.title != this.title_saved)
}

function ab2str(buf) {
  return String.fromCharCode.apply(null, new Uint16Array(buf));
}

function str2ab(str) {
  var buf = new ArrayBuffer(str.length*2); // 2 bytes for each char
  var bufView = new Uint16Array(buf);
  for (var i=0, strLen=str.length; i<strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}
