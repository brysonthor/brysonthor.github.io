
$(function(){

  $('nav.pushy a[href*=#]').click(function() {

  if (location.pathname.replace(/^\//,'') == this.pathname.replace(/^\//,'')
      && location.hostname == this.hostname) {

          var $target = $(this.hash);

          $target = $target.length && $target || $('[name=' + this.hash.slice(1) +']');

          if ($target.length) {

              var targetOffset = $target.offset().top -0;

              $('html,body').animate({scrollTop: targetOffset}, 800);

              return false;

          }

      }

  });

  var fetchFiddles = function() {
    $.ajax({
      url: 'https://jsfiddle.net/api/user/iamthor/demo/list.json',  
      jsonp: 'jsoncallback',
      dataType: "jsonp",
      success: function( response ) {
          console.log( response ); // server response
          var list = document.querySelector('#javascriptList');
          var parentTag = 'a';
          response.list.map(function(fiddle){
            var html = `<h4 class="list-group-item-heading">${fiddle.title}</h4>`;
            var newItem = document.createElement(parentTag);
            newItem.className = 'list-group-item'
            newItem.innerHTML = html;
            newItem.href = 'http://' + fiddle.url;
            newItem.setAttribute("target", "_blank")
            list.appendChild(newItem);
          });
      }
    });
  };

  //while script is at the end of the page dom will be ready so just call it, that could change.
  fetchFiddles();
});
