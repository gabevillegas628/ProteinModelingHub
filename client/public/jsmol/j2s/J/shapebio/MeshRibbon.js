Clazz.declarePackage("J.shapebio");
Clazz.load(["J.shapebio.Strands"], "J.shapebio.MeshRibbon", null, function(){
var c$ = Clazz.declareType(J.shapebio, "MeshRibbon", J.shapebio.Strands);
Clazz.overrideMethod(c$, "initShape", 
function(){
this.isMesh = true;
});
});
;//5.0.1-v7 Sat Jan 10 11:40:46 CST 2026
