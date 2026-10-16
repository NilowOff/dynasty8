/* Présentation animée de Dynasty 8.
   Elle se lance toute seule à la première visite (quand on arrive sur la page d'accueil)
   et se revoit avec « Revoir la présentation », en bas de chaque page.
   Le déroulé (moments d'entrée et de sortie de chaque élément) est dans le CSS, bloc « présentation animée ».
   Idée : un lever de soleil sur le logo, puis on entre dans la maison du logo, directement dans un vrai 360°. */
(function () {
  'use strict';
  const KEY = 'd8-intro';
  const html = document.documentElement;

  // ---- logo vectorisé, dans le repère de logo.png (720 × 373)
  const ROOF = 'M66.5 258L330.4 26L490 173L490 110L630 110L630.2 363L590 363L590 144.6L521 144.6L521 246.5L330 69.5L114.5 258Z';
  const HOUSE = 'M66.5 258L330.4 26L490 173L490 110L630 110L630 420L30 420L30 258Z';        // ce qui cache le soleil
  const DRAW = 'M80 267L330 47.7L505.5 209L505.5 127.3L610 127.3L610 380';                // le trait que suit le dessin du toit
  const SUN = { x: 582.1, y: 135.9, r: 128.4 };
  // l'intérieur de la maison (sous le toit et dans la cheminée) : la fenêtre par laquelle on entre
  const WINDOW = [[110, 263], [330, 64], [518, 238], [518, 141], [593, 141], [593, 263]];
  const ORIGIN = [322, 200];
  // les lettres DYNASTY 8 : [gauche, droite, tracé]
  const LETTERS = [[8.0,93.2,"M10.5 362C9.1 361.9 8.6 361.8 8.4 361.4C8.1 361 8 354.2 8 315.1L8 269.3L8.8 268.6L9.6 268L31.5 268.1C47.2 268.1 53.6 268.2 54.2 268.4C54.7 268.6 55.9 268.8 56.9 269C58.9 269.3 60.5 269.7 63.9 270.9C65.6 271.5 68.3 272.8 70.9 274.2C74.6 276.3 76.7 278 80 281.2C84.7 286 87.7 290.5 89.5 295.4C89.8 296.2 90.3 297.3 90.5 297.9C90.8 298.4 91 299.3 91.1 299.8C91.2 300.2 91.4 300.7 91.5 300.9C91.6 301 91.9 302 92.1 303C92.3 304 92.6 305.4 92.8 306.1C93.2 307.9 93.2 319.8 92.8 321.2C92.6 321.9 92.3 322.9 92.2 323.6C91.9 325.2 90.7 328.9 90.3 329.8C90.1 330.1 90 330.5 90 330.7C90 331 88.2 335.1 87.7 335.8C87.6 336 87.3 336.5 87.1 337C86.9 337.4 86.3 338.3 85.9 339C85.4 339.7 85 340.3 85 340.4C85 340.6 82 344.3 80.3 346.1C77.9 348.6 76 350.3 74.2 351.5C73.9 351.7 73.4 352.1 73 352.4C70 354.9 63.4 358.2 59 359.5C58 359.8 56.6 360.2 55.9 360.4C55.3 360.6 53.7 360.9 52.4 361.2C51.2 361.4 49.5 361.6 48.8 361.8C48 361.9 44.4 362 40.7 362C34.7 362.1 33.9 362 33.5 361.7C33.2 361.3 33.1 360.3 33 352.7C33 348 33 343.9 33.1 343.6C33.3 342.7 34.3 342.5 39.3 342.5C44.3 342.5 48.8 342.1 50.6 341.4C51.2 341.2 51.9 341 52.1 341C52.4 341 52.9 340.8 53.1 340.7C53.4 340.5 53.9 340.2 54.2 340.1C54.6 340 55.1 339.7 55.5 339.5C55.8 339.3 56.6 338.8 57.2 338.4C58.8 337.4 61.7 335.1 62.6 334.1C65.1 331.5 68.2 326.4 69.4 322.9C72.1 314.6 70.7 305.5 65.8 299.1C61.7 293.6 57.5 290.9 50.8 289.3C50.3 289.1 45.5 289 40.2 289C31.8 288.9 30.5 288.9 30.2 289.2C30.1 289.5 30 303.2 30 325.2L30 360.7L29.4 361.4L28.8 362.1L20.6 362.1C16.1 362.2 11.6 362.1 10.5 362Z"],[97.5,169.8,"M123.3 362C122.1 361.9 121.6 361.7 121.4 361.4C121.1 361 121 358.3 121 345.1L121 329.3L120.4 328.8C120 328.5 119.2 328.2 118.5 328.1C117.9 328 116.9 327.7 116.3 327.5C115.7 327.2 115.1 327 115 327C114.6 327 110.4 324.9 109.4 324.2C108.8 323.8 108.1 323.3 107.8 323.1C105.6 321.6 103.7 319.8 102.4 318.1C101.1 316.2 99 312.1 99 311.4C99 311.3 98.8 310.7 98.6 310.1C97.7 307.6 97.5 303.3 97.6 286.1C97.7 268 97.6 268.7 99.2 268.2C99.8 268.1 103.6 268 109.4 268L118.7 268.1L119.4 268.7L120 269.3L120 285C120 300.4 120 300.8 120.5 302.3C121.3 304.6 122.5 306 125 307.8C127.3 309.3 129.3 309.9 132.9 309.9C137.7 309.9 140.9 308.6 143.9 305.6C145.4 304.1 145.7 303.6 146.3 302L147 300.1L147 284.7L147 269.3L147.8 268.6L148.6 268L158.5 268.1L168.5 268.1L169.1 268.9L169.7 269.6L169.7 285.8C169.8 303.1 169.7 304.2 168.5 307.7C168.2 308.4 168 309.2 168 309.4C168 309.8 166.7 312.5 166 313.6C165.7 314 165.3 314.7 165.1 315.1C164.9 315.5 164.6 316 164.5 316.1C164.4 316.3 163.5 317.3 162.7 318.4C161.3 320.2 160 321.3 158.2 322.5C157.9 322.7 157.4 323.1 157.1 323.4C156.3 323.9 155.6 324.3 152.8 325.8C150.7 326.8 150 327 146.4 328C143.5 328.8 143.8 327 143.7 344.9C143.7 359.6 143.7 360.4 143.3 361.1L142.8 361.9L136.7 362.1C130 362.3 125.7 362.2 123.3 362Z"],[176.0,258.5,"M239.1 363.1C236.7 362.7 233.4 361 231.6 359.4C230 358 228.8 356.4 226.7 353.1C226 352.1 225.2 350.9 224.9 350.5C224.7 350.2 224.3 349.5 224 349C223.7 348.5 223.2 347.7 222.9 347.1C222.5 346.6 222.2 346 222.1 345.8C222 345.5 221.5 344.8 221 344.1C219.8 342.5 219.6 342 219.1 341.1C218.9 340.7 218.3 339.6 217.7 338.7C216.5 336.8 212.5 330.3 212.1 329.6C212 329.3 211.5 328.5 211 327.8C209.3 325.2 208.8 324.4 208.1 323.1C207.7 322.6 207.3 321.8 207 321.4C206.7 321 206.1 319.8 205.5 318.9C204.9 317.9 204.3 316.8 204 316.4C203.8 316 203.4 315.3 203.1 314.8C202.8 314.4 202 313.2 201.3 312.1C200.6 311.1 200 310.1 200 310C200 309.9 199.8 309.6 199.6 309.3C199.3 309 199 308.6 198.8 308.3C198.6 307.9 198.5 307.9 198.3 308.2C198.1 308.5 198 317.2 198 334.8C198 360.2 198 361 197.5 361.5C196.9 362.1 193.7 362.2 184 362.2C177.5 362.1 177 362.1 176.5 361.6L176 361.2L176.1 320.6C176.1 282 176.2 280.1 176.6 278.8C178.1 274.2 180.1 271.9 184.4 269.7C187.4 268.2 188.6 267.9 193 267.9C197.4 267.9 198.7 268.2 201.4 269.6C205.5 271.8 207.6 274 210.1 278.4C210.3 278.8 210.8 279.6 211.1 280.1C211.5 280.7 211.8 281.3 211.9 281.5C212 281.7 212.2 282 212.4 282.2C212.6 282.6 214 285 215 286.8C215.2 287.2 215.7 288.1 216 288.6C216.3 289.2 216.7 289.9 216.9 290.1C217 290.4 217.4 291 217.7 291.5C218 292 218.5 292.9 218.9 293.6C219.2 294.3 219.8 295.3 220.1 295.9C220.5 296.4 220.8 297 220.9 297.2C221 297.5 221.4 298.1 221.9 298.8C222.3 299.4 223.2 301 223.9 302.4C224.6 303.8 225.5 305.4 225.9 306C227.1 307.8 229.6 312.2 230.6 314.1C231.1 315.1 231.7 316.2 232 316.6C232.6 317.5 234.5 320.8 235 321.6C235.1 322 235.4 322.2 235.5 322.2C236.3 322.2 236.4 321.3 236.5 295.6C236.5 272.5 236.6 269.9 237 269.2C237.2 268.7 237.6 268.3 238 268.2C238.8 268 256.4 267.9 257.2 268.1C258.4 268.5 258.3 267.1 258.3 310C258.3 332.2 258.1 351.1 258 351.9C257.5 355.7 254.3 359.9 250.4 361.8C247.3 363.4 243.2 363.9 239.1 363.1Z"],[265.8,347.0,"M268.3 362C266.4 361.9 266.1 361.7 265.9 360.4C265.6 358.9 265.9 297.7 266.2 296.6C266.3 296.1 266.7 294.9 266.9 294C267.1 293.1 267.4 292.1 267.5 291.9C267.6 291.6 268 290.7 268.4 289.8C270 285.9 270.4 285 271.4 283.8C274.5 279.6 278.7 275.5 281.6 273.8C282.9 273.1 287.2 271 287.5 271C287.6 271 288.2 270.8 288.7 270.5C289.2 270.2 289.8 270 290 270C290.2 270 291.1 269.8 291.9 269.5C295.2 268.4 297.6 268.2 305.2 268.1C309.8 268 313.3 268.1 314.4 268.2C315.3 268.4 317 268.6 318.1 268.8C320.4 269.1 323.1 269.8 324.7 270.5C325.3 270.8 325.9 271 326 271C326.5 271 330.6 273.2 332 274.1C336.4 277.3 339 279.8 341.3 283.4C342.5 285.2 344 288 344 288.3C344 288.5 344.1 288.9 344.3 289.1C344.7 289.7 345.8 293.2 346.4 295.9C346.8 297.7 346.9 300 346.9 329.1C347 360.1 347 360.3 346.5 361.1C346.2 361.7 345.7 362 345.2 362.1C344.2 362.3 330.4 362.3 327.2 362C325.1 361.9 324.6 361.8 324.4 361.4C324.1 361 324 358.3 324 344.6C324 331 323.9 328.3 323.6 327.9C323.3 327.4 322.8 327.4 308.2 327.3C299.8 327.3 292.6 327.2 292.2 327.1C291.6 327 291.1 326.7 290.8 326.3C290.3 325.6 290.3 325.2 290.3 317.6L290.3 309.6L290.9 308.9L291.5 308.1L307.5 308.1C323.4 308 323.5 308 323.8 307.5C324.2 306.6 324 300.2 323.4 298.5C322.5 295.9 321.7 294.5 320 292.9C318.3 291.3 317.3 290.7 314.5 289.7C313 289.2 312.5 289.1 306.5 289.1C301 289.1 299.9 289.2 298.5 289.6C295.2 290.5 294.2 291.1 292.4 292.9C290.4 294.8 289.6 296 288.7 298.1L288.1 299.4L288 330C287.9 364.7 288.1 361.8 285.9 362.1C284.4 362.3 270.9 362.2 268.3 362Z"],[354.0,426.0,"M355.1 362C354.8 361.9 354.4 361.6 354.3 361.3C354.1 361 354 357.9 354 352.7L354 344.5L354.7 344C355.4 343.5 355.7 343.5 373.1 343.5C392.1 343.5 394.2 343.4 395.8 342.3C397.1 341.5 397.9 340.5 398.3 339.2C398.9 337.8 398.9 336.9 398.2 335.1C397.6 333.3 395.8 331.3 393.4 329.8C391.7 328.8 388.5 327 388.4 327C388.3 327 385 325.2 382.8 323.8C382.3 323.5 381.7 323.2 381.5 323.1C381.3 323 381 322.8 380.8 322.6C380.5 322.4 379.4 321.8 378.1 321.1C374.7 319.3 370 316.5 368.6 315.4C367.8 314.8 366.5 313.8 366 313.5C365.7 313.3 364.5 312.2 363.4 311.1C359 306.9 356.6 302.4 355.8 297.1C355.1 293 355.8 288.2 357.5 283.8C357.8 283.1 358 282.5 358.1 282.2C358.3 281.7 359.2 280.3 360.4 278.6C361.9 276.3 365.8 272.6 367.5 271.8C367.8 271.6 368.7 271.2 369.4 270.8C370.1 270.4 370.8 270 371 270C371.2 270 371.7 269.8 372.1 269.6C372.8 269.2 375.1 268.7 377.9 268.2C378.6 268.1 389.3 268 401.7 268L424.2 268L425 268.6L425.8 269.3L425.8 278.1C425.8 286.4 425.7 286.9 425.2 287.6C425 288.1 424.5 288.5 424.3 288.6C424.1 288.7 415.9 288.8 406.1 288.8C385 288.7 384.2 288.8 382.6 289.8C380.3 291.3 379.6 293.3 380.5 295.4C381.3 297.3 383 298.6 387.7 301C389 301.7 390.6 302.6 391.1 302.9C391.7 303.2 393.9 304.4 396.1 305.5C402.8 308.9 406.1 310.6 408.7 312.1C409.1 312.4 410.2 313 411.1 313.5C412.9 314.5 417.6 318.2 419.5 320.2C421.3 322 422.4 323.6 423.5 325.9C423.9 326.8 424.4 327.9 424.5 328.1C424.8 328.8 425.5 331.1 425.8 332.5C426.1 334.5 426 340.2 425.6 341.9C425.4 342.7 425.1 343.8 425 344.3C424.8 344.8 424.6 345.5 424.5 345.7C424.4 345.9 424 346.8 423.6 347.6C422 350.9 420.1 353.4 417 356C414.4 358.1 412.6 359.2 408.9 360.5C408.1 360.8 407 361.2 406.5 361.4C406 361.6 404.4 361.9 402.9 362C399.4 362.3 355.8 362.3 355.1 362Z"],[431.0,495.5,"M451.8 362.1C451.5 362 451.1 361.7 450.9 361.4C450.7 361 450.7 353.3 450.7 328.5C450.7 310.7 450.6 294.6 450.5 292.8C450.4 289.9 450.3 289.4 449.9 289.1C449.5 288.8 447.9 288.8 441.1 288.8L432.7 288.8L431.9 288L431.1 287.2L431.2 278.3L431.3 269.4L431.9 268.8L432.5 268.1L463 268.1C483 268 493.7 268.1 494.1 268.2C495.5 268.8 495.6 269.5 495.4 279L495.2 287.6L494.6 288.2L493.9 288.8L485.4 288.8C480.7 288.8 476.1 288.9 475.1 288.9C474.1 288.9 473.1 289 473 289.1C472.8 289.3 472.7 300.6 472.7 324.9C472.7 359.5 472.7 360.4 472.2 361.2C472 361.6 471.5 362 471.2 362.1C470.6 362.3 452.7 362.2 451.8 362.1Z"],[500.0,574.8,"M526.6 362.1C525.4 361.8 525.2 361 525.2 357.1C525.3 355.2 525.2 348.1 525.1 341.3C524.9 330.1 524.9 329 524.5 328.8C524.3 328.6 523.3 328.3 522.4 328C518 326.8 516.1 325.9 512.1 323.3C506.8 319.8 503.2 315.1 501.5 309.8C501.3 308.9 500.8 307.5 500.6 306.8C500.2 305.5 500.1 303.8 500.1 287.3L500 269.3L500.8 268.7L501.5 268L511.5 268L521.4 268L522.1 268.7L522.8 269.5L522.9 285.6L522.9 301.6L523.7 303.3C524.5 305 526.5 307.1 528.2 308C528.7 308.3 529.3 308.6 529.5 308.7C530.8 309.5 532.6 310 535.1 310.1C540.9 310.5 544.3 309.6 547.6 306.9C549.9 305 550.5 304.3 551.3 302C551.8 300.7 551.8 300.1 552 284.8L552.1 269L552.7 268.5C553.3 268 553.8 268 563.3 268L573.3 268L573.9 268.7C574.2 269 574.6 269.6 574.6 269.9C574.7 270.1 574.7 277.6 574.7 286.5C574.6 299.8 574.5 303 574.2 305C573.7 307.9 572.8 310.8 571.7 312.5C571.6 312.7 571.2 313.5 570.7 314.2C569.3 316.8 566.3 320.2 564.1 321.7C563.7 322 563.3 322.3 563.1 322.4C562.5 322.9 560.7 324 560.6 324C560.5 324 560.2 324.2 560 324.3C558.7 325.5 554.8 327 550 328.4C549.1 328.6 548.2 328.9 548.1 329.1C547.8 329.3 547.8 332 547.8 341.2C547.8 347.8 547.7 354.9 547.6 356.9C547.4 360.3 547.4 360.8 546.9 361.4L546.3 362.1L536.7 362.2C531.4 362.2 526.9 362.2 526.6 362.1Z"],[636.0,712.8,"M667.5 365C666.4 364.9 665.1 364.7 664.7 364.5C664.3 364.4 663.2 364.1 662.4 364C661.5 363.9 660.5 363.6 660.1 363.4C659.7 363.2 659.2 363 658.9 363C658.7 363 658 362.8 657.4 362.5C656.9 362.3 655.7 361.7 654.8 361.4C652.7 360.5 648.9 358.3 647.8 357.4C647.7 357.2 647.1 356.7 646.5 356.2C643.2 353.6 640 349.5 638.5 346C638.2 345.2 637.8 344.3 637.6 343.9C637.4 343.5 637.1 342.4 636.9 341.6C636.6 340.8 636.4 339.7 636.2 339.2C636.1 338.8 636 336.4 636 334.1C636 330.5 636.1 329.5 636.5 328.2C636.8 327.3 637 326.4 637 326.2C637 325.2 638.9 321 640.2 319.1C641.3 317.5 643.1 315.4 644.4 314.2C645.6 313 648.5 310.9 650.2 310.1C650.6 309.8 651 309.6 651 309.5C651 309.4 650.1 308.5 648.9 307.5C645.7 304.8 644.5 303.3 643.2 300.4C641.3 296.1 641.1 295.5 641.1 290.4C641.1 286.3 641.2 285.7 641.7 284C642.1 283 642.5 281.9 642.7 281.5C642.8 281.2 643 280.7 643 280.5C643 280.3 643.2 279.7 643.5 279.1C643.8 278.6 644 278 644 277.9C644 277.7 644.9 276.5 646.5 274.4C647.8 272.8 650.6 270.1 652.2 268.8C653.8 267.7 660.8 264 661.5 264C661.7 264 662.6 263.8 663.4 263.5C664.2 263.2 665.5 263 666.3 263C667.4 262.9 668 262.8 668.3 262.5C669 261.9 678.8 261.9 681.4 262.5C682.3 262.8 683.6 263.1 684.2 263.2C686.1 263.6 688.1 264.2 688.9 264.6C696.2 268.1 696.7 268.4 700 271.7C702.7 274.4 704.4 276.8 705.4 279.4C705.8 280.4 706.3 281.6 706.5 282.2C707.2 283.8 707.8 287.3 707.7 289.6C707.7 291.9 707 296.5 706.4 297.9C705.2 300.6 704.6 301.8 703.5 303.1C702.2 304.7 700.3 306.7 698.7 307.8C697.6 308.6 697.7 309.3 698.8 309.9C702.5 311.8 706.5 315.7 709.1 320C711 323.1 711.5 324.3 712.2 328.2C713.4 333.7 712.5 340.5 710.2 345.5C707.9 350.4 703.8 355.1 699.4 358C697.2 359.5 695.8 360.2 691.1 362.4C690.1 362.9 686.7 363.9 684.9 364.2C684 364.4 682.9 364.6 682.4 364.8C681 365.1 670.1 365.3 667.5 365ZM678.2 346.4C679.7 346 681.1 345.4 683.7 344C684.8 343.5 687.8 340.2 688.4 339C689.7 336.2 690.3 332.5 689.8 330.4C688.6 325.9 688.1 324.8 686 322.7C684.6 321.4 684.4 321.2 681.8 319.9C678.6 318.3 673.7 317.8 669.9 318.7C668.3 319.2 667.5 319.5 664.8 321C664.5 321.2 663.5 322 662.7 322.8C659.7 325.8 658.4 329.8 659 334.7C659.3 337.9 661.1 341 664 343.3C665 344.2 668.4 345.8 670 346.2C672.1 346.8 676 346.9 678.2 346.4ZM679.2 301.5C679.8 301.2 680.3 301 680.5 301C681 301 684.3 298.1 685.1 296.9C685.9 295.6 686.8 292.9 686.8 291.4C686.8 290.1 685.8 286.9 685.2 285.8C684.1 284.2 682.7 283 680.2 281.7C679.8 281.4 678.3 281 676.9 280.7C674.5 280.3 674.4 280.3 672 280.7C669.1 281.2 667.6 281.8 665.8 283.4C661.8 286.9 661 292.4 663.8 296.9C664.7 298.4 667.2 300.5 668.7 301.2C669.5 301.5 670.9 301.9 671.8 302C674.2 302.3 677.9 302 679.2 301.5Z"]];
  // moments clés (secondes) : les mêmes que dans le CSS
  const T = { enter: 3.6, enterDur: 1.1, cards: 8.0, decos: 10.8, go: 13.5 };

  function logoSVG(id) {
    const clips = LETTERS.map((l, i) => '<clipPath id="' + id + 'l' + i + '"><rect x="' + (l[0] - 3) + '" y="150" width="' + (l[1] - l[0] + 6) + '" height="219"/></clipPath>').join('');
    const word = LETTERS.map((l, i) => '<g clip-path="url(#' + id + 'l' + i + ')"><path class="i-letter" style="--i:' + i + '" d="' + l[2] + '"/></g>').join('');
    return '<svg viewBox="0 0 720 373" aria-hidden="true" focusable="false"><defs>' +
      '<radialGradient id="' + id + 'g"><stop offset="0" stop-color="#FDC614" stop-opacity=".5"/><stop offset=".4" stop-color="#FDC614" stop-opacity=".15"/><stop offset="1" stop-color="#FDC614" stop-opacity="0"/></radialGradient>' +
      '<mask id="' + id + 's" maskUnits="userSpaceOnUse" x="-400" y="-600" width="1600" height="1200"><rect x="-400" y="-600" width="1600" height="863" fill="#fff"/><path d="' + HOUSE + '" fill="#000"/></mask>' +
      '<mask id="' + id + 'd" maskUnits="userSpaceOnUse" x="0" y="0" width="720" height="400"><path class="i-draw" d="' + DRAW + '" pathLength="1" fill="none" stroke="#fff" stroke-width="62" stroke-linejoin="round"/></mask>' +
      clips + '</defs>' +
      '<g class="i-glow"><circle cx="' + SUN.x + '" cy="' + SUN.y + '" r="340" fill="url(#' + id + 'g)"/></g>' +
      '<g mask="url(#' + id + 's)"><g class="i-sunrise"><circle cx="' + SUN.x + '" cy="' + SUN.y + '" r="' + SUN.r + '" fill="#FDC614"/></g></g>' +
      '<path class="i-roof" d="' + ROOF + '" fill="#46C882" mask="url(#' + id + 'd)"/>' +
      '<g class="i-word" fill="#ECEFEC">' + word + '</g></svg>';
  }

  // ---- outils
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  const initials = n => { const w = String(n || '').trim().split(/\s+/).filter(Boolean).map(x => Array.from(x)[0]); return w.length ? (w[0] + (w.length > 1 ? w[w.length - 1] : '')).toUpperCase() : '?'; };
  // adresse d'une image du serveur (même règle que le site, au cas où une ancienne version du site serait en cache)
  const API = ((document.querySelector('meta[name="d8-api"]') || {}).content || '').trim().replace(/\/+$/, '');
  const mediaOf = (a, p) => !p ? '' : a && a.media ? a.media(p) : (API && p.startsWith('media/') ? API + '/' + p : p);
  const smooth = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
  // intégrale de smooth : une vitesse qui monte en douceur
  const ramp = (x, w) => x <= 0 ? 0 : x >= w ? x - w / 2 : w * (Math.pow(x / w, 3) - Math.pow(x / w, 4) / 2);
  function inPoly(pts, x, y) {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  function waitData(ms) {
    return new Promise(res => {
      const t0 = performance.now();
      (function poll() {
        const a = window.__d8;
        if (a && a.state && a.state.data) return res(a);
        if (performance.now() - t0 > ms) return res(null);
        setTimeout(poll, 100);
      })();
    });
  }
  // ce que la présentation montre : le bien à l'affiche (le même que sur l'accueil), d'autres biens, les décorateurs
  function pick(a) {
    const d = a.state.data, L = d.listings || [];
    const base = L.filter(l => !l.deco && l.points && l.points.length);
    const open = base.filter(l => l.status === 'disponible' || l.status === 'reserve');
    const pool = open.length ? open : base;
    const heroId = a.hero ? a.hero() : null;
    const feat = pool.find(l => l.id === heroId) || pool.find(l => l.cover) || pool[0] || null;
    const cards = feat ? [feat].concat(pool.filter(l => l !== feat && l.cover)).slice(0, 4) : [];
    // les décorateurs qui ont déjà publié une décoration (sinon tous), les plus actifs d'abord
    const all = (d.decorators || []).map(x => ({ x, n: L.filter(l => l.deco === x.id).length }))
      .sort((p, q) => q.n - p.n || (q.x.photo ? 1 : 0) - (p.x.photo ? 1 : 0));
    const busy = all.filter(e => e.n > 0);
    const decos = (busy.length ? busy : all).slice(0, 3);
    const tag = ((d.site && d.site.home && d.site.home.tagline) || '').replace(/\*\*/g, '').trim();
    return { feat, cards, decos, tag };
  }

  let cur = null;

  function play(auto) {
    if (cur) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const prevFocus = document.activeElement;
    const root = el('div', 'pres');
    root.id = 'pres';
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Présentation de Dynasty 8');
    root.innerHTML =
      '<div class="i-sky"></div>' +
      '<div class="i-panoclip"><div class="i-pano"><div class="i-stage"></div></div></div>' +
      '<div class="i-scrim"></div>' +
      '<div class="i-logo-wrap"><div class="i-logo-box"><div class="i-logo-zoom">' + logoSVG('d8a') + '</div></div><p class="i-place">Agence immobilière de Los Santos</p></div>' +
      '<img class="i-mark" src="logo-sombre.png" alt="" width="69" height="36">' +
      '<section class="i-s2"><span class="i-pill">360°</span><h2><span class="i-mask"><span>Visitez chaque bien en 360°</span></span></h2>' +
      '<p class="i-sub">Entrez, regardez autour de vous et passez d’une pièce à l’autre, comme si vous y étiez.</p></section>' +
      '<section class="i-s3"><header><h2><span class="i-mask"><span>Appartements, maisons, bureaux</span></span></h2>' +
      '<p class="i-sub">Tout le catalogue de l’agence, avec le prix et les infos de chaque bien.</p></header><div class="i-cards"></div></section>' +
      '<section class="i-s4"><header><h2><span class="i-mask"><span>Des intérieurs signés par nos décorateurs</span></span></h2>' +
      '<p class="i-sub">Chaque décoration se visite avec ou sans la déco.</p></header><div class="i-decos"></div></section>' +
      '<section class="i-s5"><div class="i-logo2">' + logoSVG('d8b') + '</div><p class="i-tag">Votre projet, notre priorité. Votre futur commence ici.</p>' +
      '<button class="i-go" type="button">Découvrir le site</button></section>' +
      '<button class="i-skip" type="button">Passer</button>' +
      '<div class="i-bar" aria-hidden="true"><i></i></div>';
    const $ = s => root.querySelector(s);
    const bar = $('.i-bar i'), stage = $('.i-stage');
    // le reste de la page est mis en pause pour le clavier et les lecteurs d'écran
    const others = Array.from(document.body.children).filter(n => n !== root && !n.inert);
    document.body.appendChild(root);
    others.forEach(n => { n.inert = true; });
    html.classList.add('intro-on'); html.classList.remove('intro-pending');
    cur = { root, leaving: false };

    // l'horloge : la barre de progression (elle suit aussi les avances rapides des tests)
    const clock = () => { const a = bar.getAnimations()[0]; return a && a.currentTime != null ? a.currentTime / 1000 : 0; };

    // ---- la vue 360°
    let viewer = null, y0 = 0, p0 = -4;
    function flat(url) { if (!url || stage.querySelector('.i-flat')) return; const im = el('img', 'i-flat'); im.alt = ''; im.src = url; stage.appendChild(im); stage.classList.add('ready'); }
    function camera() {
      // devant la maison : grand angle, on tourne doucement ; en entrant : on resserre, puis on fait le tour de la pièce
      const t = clock(), v = viewer.view, k = smooth((t - T.enter) / T.enterDur);
      v.yaw = y0 - 30 + 7 * t + 19 * ramp(t - 4.1, 1.6);
      v.pitch = p0 + 4 - 6 * k;
      v.fov = 106 - (106 - viewer.defaultFov()) * k;
      viewer.camera.fov = v.fov; viewer.camera.updateProjectionMatrix();
      viewer.camera.lookAt(window.panoDir(v.yaw, v.pitch));
    }
    function pano(url, cover) {
      // mouvement réduit : la vue ne tourne pas, une belle photo du bien suffit (et on ne lance pas la 3D)
      if (reduce) { flat(cover || 'preview.jpg'); return; }
      try {
        if (!window.PanoViewer || !window.THREE) throw new Error('3D indisponible');
        viewer = new window.PanoViewer(stage, { autoRotate: false });
        viewer.frameHooks.push(camera);
        window.panoLoadTexture(url, viewer.renderer).then(tex => { if (viewer && viewer.alive) viewer.setTexture(tex); }, () => flat(cover));
      } catch (e) { viewer = null; flat(cover || 'preview.jpg'); }
    }

    // ---- le contenu (biens et décorateurs), dès que les données sont là
    let filled = false;
    function fill(a, c) {
      if (filled) return; filled = true;
      const cards = $('.i-cards');
      cards.style.setProperty('--n', Math.max(1, c.cards.length));
      c.cards.forEach((l, i) => {
        const f = el('figure', 'i-card' + (i === 0 ? ' first' : ''));
        f.style.setProperty('--d', (T.cards + i * 0.09).toFixed(2) + 's');
        const ph = el('div', 'ph');
        if (l.cover) { const im = el('img'); im.alt = ''; im.decoding = 'async'; im.src = mediaOf(a, l.cover); ph.appendChild(im); }
        const cap = el('figcaption');
        cap.append(el('b', '', l.name), el('small', '', a.kind ? a.kind(l) : (l.type || '')));
        const pr = a.price ? a.price(l) : null;
        if (pr) cap.append(el('small', 'pr', pr.text + (pr.per || '')));
        f.append(ph, cap); cards.appendChild(f);
      });
      const box = $('.i-decos');
      c.decos.forEach(({ x, n }, i) => {
        const card = el('div', 'i-deco');
        card.style.setProperty('--d', (T.decos + i * 0.1).toFixed(2) + 's');
        const bn = el('div', 'bn');
        if (x.banner) bn.style.backgroundImage = 'url("' + mediaOf(a, x.banner) + '")';
        const av = el('span', 'av');
        if (x.photo) {
          const im = el('img'); im.alt = ''; im.src = mediaOf(a, x.photo);
          im.addEventListener('error', () => { av.textContent = initials(x.name); });
          av.appendChild(im);
        } else av.textContent = initials(x.name);
        const who = el('div', 'who'), txt = el('div');
        txt.append(el('b', '', x.name), el('small', '', n ? n + (n > 1 ? ' décorations' : ' décoration') : 'Décorateur'));
        who.append(av, txt); card.append(bn, who); box.appendChild(card);
      });
      if (c.tag) $('.i-tag').textContent = c.tag;
      layout();
    }

    // ---- positions : la fenêtre de la maison à l'écran, le zoom pour y entrer, la carte où la vue se range
    function layout() {
      if (!cur || cur.root !== root) return;
      const W = window.innerWidth, H = window.innerHeight;
      const box = $('.i-logo-box').getBoundingClientRect(), k = box.width / 720;
      const P = ([x, y]) => [box.left + x * k, box.top + y * k];
      const O = P(ORIGIN), g = WINDOW.map(P);
      const scaled = S => g.map(([x, y]) => [O[0] + S * (x - O[0]), O[1] + S * (y - O[1])]);
      const edge = [];
      for (let i = 0; i <= 24; i++) { const f = i / 24; edge.push([f * W, -6], [f * W, H + 6], [-6, f * H], [W + 6, f * H]); }
      let S = 3, q = scaled(S);
      while (S < 120 && !edge.every(([x, y]) => inPoly(q, x, y))) { S *= 1.06; q = scaled(S); }
      const fmt = pts => pts.map(([x, y]) => x.toFixed(1) + 'px ' + y.toFixed(1) + 'px').join(', ');
      const st = root.style;
      st.setProperty('--g0', fmt(g)); st.setProperty('--g1', fmt(q));
      st.setProperty('--zoom', S.toFixed(3));
      st.setProperty('--ox', (ORIGIN[0] * k).toFixed(1) + 'px'); st.setProperty('--oy', (ORIGIN[1] * k).toFixed(1) + 'px');
      const ph = $('.i-card.first .ph');
      let r = ph ? ph.getBoundingClientRect() : null;
      if (!r || !r.width) { const w = Math.min(300, W * 0.6), h = w * 0.75; r = { left: (W - w) / 2, right: (W + w) / 2, top: H - h - H * 0.12, bottom: H - H * 0.12 }; }
      st.setProperty('--ct', r.top.toFixed(1) + 'px'); st.setProperty('--cr', (W - r.right).toFixed(1) + 'px');
      st.setProperty('--cb', (H - r.bottom).toFixed(1) + 'px'); st.setProperty('--cl', r.left.toFixed(1) + 'px');
    }
    layout();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
    window.addEventListener('resize', layout);

    // la vue 360° doit être prête quand la maison s'ouvre (vers 3 s) ; sinon on montre un bien de démonstration
    let started = false;
    const fallback = setTimeout(() => { if (!started) { started = true; pano('pano_2k.jpg', 'preview.jpg'); } }, 2200);
    waitData(6500).then(a => {
      if (!cur || cur.root !== root) return;
      const c = a ? pick(a) : null;
      if (!started) {
        started = true; clearTimeout(fallback);
        if (c && c.feat) {
          const p = c.feat.points.find(x => x.id === c.feat.start) || c.feat.points[0];
          y0 = isFinite(+p.yaw) ? +p.yaw : 0; p0 = isFinite(+p.pitch) ? +p.pitch : -4;
          pano(mediaOf(a, p.imageSmall || p.image), c.feat.cover ? mediaOf(a, c.feat.cover) : null);
        } else pano('pano_2k.jpg', 'preview.jpg');
      }
      if (c && clock() < 7) fill(a, c);
    });

    // ---- fin : la présentation s'ouvre en cercle sur le site
    function finish(from) {
      if (!cur || cur.leaving) return;
      cur.leaving = true;
      let x = window.innerWidth / 2, y = window.innerHeight / 2;
      if (from && from.getBoundingClientRect) { const r = from.getBoundingClientRect(); if (r.width) { x = r.left + r.width / 2; y = r.top + r.height / 2; } }
      root.style.setProperty('--rx', x.toFixed(0) + 'px'); root.style.setProperty('--ry', y.toFixed(0) + 'px');
      root.classList.add('leaving');
      setTimeout(cleanup, reduce ? 450 : 900);
    }
    function cleanup() {
      clearTimeout(fallback);
      if (viewer) { viewer.dispose(); viewer = null; }
      window.removeEventListener('resize', layout);
      document.removeEventListener('keydown', onKey, true);
      root.remove();
      others.forEach(n => { n.inert = false; });
      html.classList.remove('intro-on');
      cur = null;
      if (!auto && prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
      document.dispatchEvent(new CustomEvent('d8-intro-end'));
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); finish($('.i-skip')); }
      else if (e.key === 'Tab') {
        // le clavier reste dans la présentation : Passer, puis Découvrir le site quand il est là
        const list = [$('.i-skip')].concat(clock() > T.go ? [$('.i-go')] : []);
        const i = list.indexOf(document.activeElement);
        e.preventDefault();
        list[(i + (e.shiftKey ? list.length - 1 : 1)) % list.length].focus();
      }
    }
    document.addEventListener('keydown', onKey, true);
    $('.i-skip').addEventListener('click', e => finish(e.currentTarget));
    $('.i-go').addEventListener('click', e => finish(e.currentTarget));
    bar.addEventListener('animationend', () => finish($('.i-go')));
    $('.i-skip').focus({ preventScroll: true, focusVisible: false });
  }

  // avance rapide pour les tests : fige toute la présentation à l'instant donné (ms)
  function seek(ms) {
    if (!cur) return false;
    cur.root.getAnimations({ subtree: true }).forEach(a => { a.pause(); a.currentTime = ms; });
    return true;
  }

  // première visite, sur la page d'accueil : la page a déjà été masquée dès le chargement (classe intro-pending)
  function boot() {
    if (!html.classList.contains('intro-pending')) return;
    const go = () => { try { localStorage.setItem(KEY, '1'); } catch (e) { /* navigation privée */ } play(true); };
    if (document.hidden) {
      document.addEventListener('visibilitychange', function v() { if (!document.hidden) { document.removeEventListener('visibilitychange', v); go(); } });
    } else go();
  }

  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('#introReplay');
    if (b) { e.preventDefault(); play(false); }
  });
  window.D8Intro = { play: () => play(false), seek, get running() { return !!cur; } };
  boot();
})();
