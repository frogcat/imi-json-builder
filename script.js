function Voc(imiv) {
  this.data = IMIVParser.parse(imiv).filter(a => {
    return (a.deprecated !== false);
  });
  this.data.forEach(a => {
    if (a.type === "set") {
      a.class.pn = a.class.prefix + ":" + a.class.name;
      a.property.pn = a.property.prefix + ":" + a.property.name;
    }
    if (a.prefix && a.name) a.pn = a.prefix + ":" + a.name;
    a.res = {};
    (a.restriction || []).forEach(b => {
      if (b.prefix && b.name) b.pn = b.prefix + ":" + b.name;
      if (a.res[b.type] === undefined) a.res[b.type] = b;
      else Object.keys(b).forEach(c => {
        a.res[b.type][c] = b[c];
      });
    });
  });
}

Voc.prototype = {
  // 派生元のないクラス定義のリストを取得
  root: function() {
    return this.data.filter(a => a.type === "class" && a.res.type === undefined);
  },
  // 指定された pn から派生するクラス定義のリストを取得
  children: function(pn) {
    return this.data.filter(a => a.type === "class" && a.res.type && a.res.type.pn === pn);
  },
  // 指定された pn の定義を取得
  find: function(pn) {
    return this.data.find(a => a.pn === pn);
  },
  // clazz が target であるか、または派生クラスである場合は true
  is: function(clazz, target) {
    var def1 = this.find(clazz);
    var def2 = this.find(target);
    if (def1 === undefined || def2 === undefined) return false;
    if (clazz === target) return true;
    if (def1.res.type === undefined) return false;
    return this.is(def1.res.type.pn, target);
  },
  // pn で指定されたクラスで使用できる set 文のリストを取得
  prop: function(pn) {
    var p = [];
    for (var f = pn; f;) {
      p.unshift(f);
      var def = this.find(f);
      f = def.res.type ? def.res.type.pn : null;
    }
    var a = [];
    p.forEach(f => {
      this.data.filter(b => b.type === "set" && b.class.pn === f).forEach(b => {
        a.push(b);
      });
    });
    return a;
    //    return this.data.filter(a => a.type === "set" && this.is(pn, a.class.pn));
  }
};

// ツリーから JSON-LD を生成
var update = function() {

  // Prefixed name を JSON-LD 用に unprefixed に
  var normalize = function(a) {
    return a ? a.split(":").pop() : a;
  };

  var dig = function(e, depth) {
    var obj = {};
    if (depth === 0) {
      obj["@context"] = "https://imi.go.jp/ns/core/context.jsonld";
    }
    if (e.attr("data-type"))
      obj["@type"] = normalize(e.attr("data-type"));

    e.children("ul").children("li").each(function() {
      var f = $(this);
      if (f.find("input:checked").length === 0) return;
      var key = normalize(f.attr("data-property"));
      var val = normalize(f.attr("data-type"));
      var x = {};
      if (f.attr("data-fill")) x = f.attr("data-fill");
      else x = dig(f, depth + 1);
      if (obj[key] === undefined) obj[key] = x;
      else if (Array.isArray(obj[key])) obj[key].push(x);
      else obj[key] = [obj[key], x];
    });

    if (obj["@id"] !== undefined && Object.keys(obj).length === 1)
      return obj["@id"];

    if (obj["@id"] !== undefined && obj["@type"] !== undefined && Object.keys(obj).length === 2)
      return obj["@id"];

    return obj;
  };

  var jsonld = dig($("#workspace>ul>li"), 0);
  $("#result>div").text(JSON.stringify(jsonld, null, 4));
};


$(function() {
  // クラス名フィルタ
  $("#filter").change(function() {
    var v = $(this).val();
    if (v.length === 0) {
      $("#classes").addClass("tree");
      $("#classes li").show();
    } else {
      $("#classes").removeClass("tree");
      $("#classes li[data-type]").each(function() {
        if ($(this).attr("data-type").indexOf(v) === -1)
          $(this).hide();
        else $(this).show();
      });
    }
  });

  // チェックボックス
  $("#workspace").on("change", ":checkbox", update);

  // 派生クラスの選択
  $("#workspace").on("change", "select", function() {
    var li = $(this).parent("li");
    li.attr("data-type", $(this).val()).removeClass("ready open").addClass("close");
    li.children("ul").empty();
    li.children("a").first().click();
  });
});

fetch("https://imi.go.jp/ns/core/242/imicore242.imiv").then(a => a.text()).then(imiv => {
  var voc = new Voc(imiv);
  voc.data.filter(a => a.type === "vocabulary").forEach(a => {
    var name = a.metadata.find(b => b.type === "name" && b.language === undefined);
    var version = a.metadata.find(b => b.type === "version");
    $("#voc").text(name.data + " ver." + version.data);
  });
  // クラスツリーの構築
  (function() {
    var dig = function(def, depth) {
      var desc = "説明がありません";
      def.metadata.forEach(a => {
        if (a.type === "description" && a.language === undefined) desc = a.data;
      });
      var c = voc.data.filter(a => a.type === "set" && a.class.pn === def.pn);
      var li = $("<li/>", {
        "class": "depth" + depth,
        "data-type": def.pn
      }).append($("<a href='#'/>").attr("title", desc).text(def.name)).appendTo("#classes ul");
      voc.children(def.pn).forEach(a => {
        dig(a, depth + 1);
      });
    };
    voc.root().forEach(a => {
      dig(a, 0);
    });
    $("#filter").change();
  })();


  // ルートクラスが選択されたら、ワークスペースを初期化する
  $("#classes").on("click", "a", function() {
    var cz = voc.find($(this).parent("li").attr("data-type"));
    var li = $("<li/>", {
      "class": "resource close",
      "data-type": cz.pn
    }).append($("<a href='#'/>").text(cz.name)).append($("<ul/>"));
    $("#workspace>ul").empty().append(li);
    $("#workspace a").click();
    update();
    return false;
  });


  $("#workspace").on("click", "button.copy", function() {
    var li = $(this).parent("li");
    var a = li.clone()
    li.after(a);
    a.find("button.copy").removeClass("copy").addClass("delete").attr("title", "このプロパティを削除することができます").text("x");
    update();
    return false;
  });
  $("#workspace").on("click", "button.delete", function() {
    $(this).parent("li").remove();
    update();
    return false;
  });
  // クリックされた型を展開する



  $("#workspace").on("click", "a", function() {

    $(this).parent("li").toggleClass("close open");

    if ($(this).parent("li").is(".ready"))
      return false;

    var pn = $(this).parent("li").attr("data-type");
    var ul = $(this).parent().children("ul").empty();

    // リソース URI
    ul.append("<li class='literal' data-property='@id' data-fill='{{xsd:anyURI}}'><label><input type='checkbox' title='このプロパティを使用するにはチェックします'/><span title='このリソースを一意に特定するための URI'>@id</span></label></li>");

    // プロパティ
    voc.prop(pn).forEach(a => {
      var p = voc.find(a.property.pn);
      var desc = "説明がありません";
      p.metadata.forEach(a => {
        if (a.type === "description" && a.language === undefined) desc = a.data;
      });

      if (p.res.type.pn !== "ic:電話番号型" && voc.find(p.res.type.pn) !== undefined) {
        var sel = $("<select/>");
        var dig = function(x, prefix) {
          sel.append($("<option/>").val(x.pn).text(prefix + x.name));
          voc.children(x.pn).forEach(c => {
            dig(c, prefix + "+");
          });
        };
        dig(p.res.type, "");

        var li = $("<li/>", {
          "class": "resource close",
          "data-property": p.pn,
          "data-type": p.res.type.pn
        });
        li.append($("<a href='#'/>").attr("title", desc).text(p.name));

        if (a.res.cardinality === undefined || a.res.cardinality.max !== 1) {
          li.append($("<button class='copy' title='このプロパティは増やすことができます'>+</button>"));
        }

        //        if (sel.children("option").length > 0) li.append(sel);
        if (sel.children("option").length === 1)
          sel.attr("disabled", "disabled").attr("title", "より具体的なクラスの選択肢はありません");
        else
          sel.attr("title", "より具体的なクラスを選択することが可能です");
        li.append(sel);

        li.append($("<ul/>"));
        ul.append(li);
      } else {
        var li = $("<li class='literal' data-property='" + p.pn + "' data-fill='{{" + p.res.type.pn + "}}'/>").appendTo(ul);
        var label = $("<label/>").appendTo(li);
        label.append($("<input type='checkbox' title='このプロパティを使用するにはチェックします'/>"));
        label.append($("<b/>").attr("title", desc + "(" + p.res.type.pn + ")").text(p.name));
        if (a.res.cardinality === undefined || a.res.cardinality.max !== 1) {
          li.append($("<button class='copy' title='このプロパティは増やすことができます'>+</button>"));
        }
      }
    });
    $(this).parent("li").addClass("ready");
    return false;
  });

});
