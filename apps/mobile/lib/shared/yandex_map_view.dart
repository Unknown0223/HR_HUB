import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../core/theme/app_theme.dart';

const _yandexApiKey = String.fromEnvironment('YANDEX_MAPS_API_KEY');

class MapPin {
  const MapPin({
    required this.id,
    required this.lat,
    required this.lng,
    required this.initials,
    this.label,
    this.photoUrl,
    this.color = AppColors.accent,
    this.pulse = false,
    this.accuracy,
  });

  final String id;
  final double lat;
  final double lng;
  final String initials;
  final String? label;
  final String? photoUrl;
  final Color color;
  final bool pulse;
  final double? accuracy;

  Map<String, Object?> toJson() => {
        'id': id,
        'lat': lat,
        'lng': lng,
        'initials': initials,
        'label': label,
        'photo': photoUrl,
        'color': '#${(color.toARGB32() & 0xFFFFFF).toRadixString(16).padLeft(6, '0')}',
        'pulse': pulse,
        'accuracy': accuracy,
      };
}

/// Yandex Maps (JS API 2.1) inside a WebView, so the phone shows the same map
/// as the web board. Pins are avatar bubbles; [track] draws the day's route.
class YandexMapView extends StatefulWidget {
  const YandexMapView({
    super.key,
    required this.pins,
    this.track = const [],
    this.onPinTap,
    this.fitKey,
  });

  final List<MapPin> pins;
  final List<(double, double)> track;
  final ValueChanged<String>? onPinTap;

  /// The map re-fits its bounds only when this changes, so polling updates
  /// do not fight the user's pan/zoom.
  final Object? fitKey;

  @override
  State<YandexMapView> createState() => _YandexMapViewState();
}

class _YandexMapViewState extends State<YandexMapView> {
  late final WebViewController _controller;
  bool _ready = false;
  bool _failed = false;
  Object? _fittedFor = const Object();

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(AppColors.bgSoft)
      ..addJavaScriptChannel('HrHub', onMessageReceived: _onMessage)
      ..setNavigationDelegate(
        NavigationDelegate(
          onWebResourceError: (e) {
            if (e.isForMainFrame == true && mounted) setState(() => _failed = true);
          },
        ),
      )
      ..loadHtmlString(_html, baseUrl: 'http://localhost/');
  }

  @override
  void didUpdateWidget(covariant YandexMapView oldWidget) {
    super.didUpdateWidget(oldWidget);
    _push();
  }

  void _onMessage(JavaScriptMessage m) {
    if (m.message == 'ready') {
      if (!mounted) return;
      setState(() => _ready = true);
      _push();
    } else if (m.message == 'error') {
      if (mounted) setState(() => _failed = true);
    } else if (m.message.startsWith('tap:')) {
      widget.onPinTap?.call(m.message.substring(4));
    }
  }

  void _push() {
    if (!_ready) return;
    final fit = _fittedFor != widget.fitKey;
    _fittedFor = widget.fitKey;
    final data = jsonEncode({
      'pins': widget.pins.map((p) => p.toJson()).toList(),
      'track': widget.track.map((p) => [p.$1, p.$2]).toList(),
      'fit': fit,
    });
    _controller.runJavaScript('render($data)');
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        WebViewWidget(
          controller: _controller,
          gestureRecognizers: {
            Factory<EagerGestureRecognizer>(() => EagerGestureRecognizer()),
          },
        ),
        if (!_ready || _failed)
          Positioned.fill(
            child: ColoredBox(
              color: AppColors.bgSoft,
              child: Center(
                child: _failed
                    ? const Padding(
                        padding: EdgeInsets.all(20),
                        child: Text(
                          'Xaritani yuklab bo‘lmadi. Internetni tekshiring.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: AppColors.inkMuted),
                        ),
                      )
                    : const CircularProgressIndicator(),
              ),
            ),
          ),
      ],
    );
  }
}

final _html = '''
<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
html,body,#map{margin:0;padding:0;width:100%;height:100%;font-family:-apple-system,Roboto,sans-serif}
.pin{position:absolute;left:-45px;bottom:0;width:90px;display:flex;flex-direction:column;align-items:center}
.name{margin-bottom:3px;max-width:88px;overflow:hidden;text-overflow:ellipsis;background:#fff;border-radius:8px;padding:2px 7px;font-size:12px;font-weight:700;color:#1E2B22;white-space:nowrap;box-shadow:0 1px 5px rgba(0,0,0,.22)}
.av{position:relative;z-index:1;width:46px;height:46px;border-radius:50%;border:3px solid #2FA350;background:#E5F3E6 center/cover no-repeat;display:flex;align-items:center;justify-content:center;font-weight:800;color:#1E2B22;font-size:16px;box-shadow:0 4px 12px rgba(0,0,0,.28);box-sizing:border-box}
.tail{width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid #2FA350;margin-top:-1px}
.pulse{position:absolute;left:50%;top:50%;width:62px;height:62px;margin:-31px 0 0 -31px;border-radius:50%;background:rgba(47,163,80,.35);animation:p 2s infinite}
@keyframes p{0%{transform:scale(.55);opacity:.9}100%{transform:scale(1.45);opacity:0}}
</style>
<script src="https://api-maps.yandex.ru/2.1/?lang=ru_RU${_yandexApiKey.isEmpty ? '' : '&apikey=$_yandexApiKey'}" onerror="HrHub.postMessage('error')"></script>
</head><body><div id="map"></div><script>
var map=null,objs=[],pending=null;
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
if(window.ymaps){ymaps.ready(function(){
  map=new ymaps.Map('map',{center:[41.311,69.279],zoom:11,controls:['zoomControl']},{suppressMapOpenBlock:true});
  HrHub.postMessage('ready');
  if(pending){render(pending);pending=null;}
});}else{HrHub.postMessage('error');}
function render(d){
  if(!map){pending=d;return;}
  objs.forEach(function(o){map.geoObjects.remove(o)});objs=[];
  var pts=[];
  if(d.track&&d.track.length>1){
    var line=new ymaps.Polyline(d.track,{},{strokeColor:'#1f8f45',strokeWidth:4,strokeOpacity:.85});
    map.geoObjects.add(line);objs.push(line);
    d.track.forEach(function(p){pts.push(p)});
  }
  (d.pins||[]).forEach(function(m){
    if(m.accuracy&&m.accuracy>15){
      var c=new ymaps.Circle([[m.lat,m.lng],m.accuracy],{},{fillColor:'#2FA35022',strokeColor:'#2FA35066',strokeWidth:1});
      map.geoObjects.add(c);objs.push(c);
    }
    var col=m.color||'#2FA350';
    var html='<div class="pin">'+(m.label?'<div class="name">'+esc(m.label)+'</div>':'')
      +'<div style="position:relative">'+(m.pulse?'<div class="pulse"></div>':'')
      +'<div class="av" style="border-color:'+col+';'+(m.photo?'background-image:url(&quot;'+esc(m.photo)+'&quot;)':'')+'">'
      +(m.photo?'':esc(m.initials))+'</div></div>'
      +'<div class="tail" style="border-top-color:'+col+'"></div></div>';
    var pm=new ymaps.Placemark([m.lat,m.lng],{},{
      iconLayout:ymaps.templateLayoutFactory.createClass(html),
      iconShape:{type:'Circle',coordinates:[0,-32],radius:26}
    });
    pm.events.add('click',function(){HrHub.postMessage('tap:'+m.id)});
    map.geoObjects.add(pm);objs.push(pm);pts.push([m.lat,m.lng]);
  });
  if(d.fit){
    if(pts.length===1)map.setCenter(pts[0],15);
    else if(pts.length>1)map.setBounds(ymaps.util.bounds.fromPoints(pts),{checkZoomRange:true,zoomMargin:60});
  }
}
</script></body></html>
''';
