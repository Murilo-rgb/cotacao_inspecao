function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == _typeof(i) ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != _typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
function _toConsumableArray(r) { return _arrayWithoutHoles(r) || _iterableToArray(r) || _unsupportedIterableToArray(r) || _nonIterableSpread(); }
function _nonIterableSpread() { throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _iterableToArray(r) { if ("undefined" != typeof Symbol && null != r[Symbol.iterator] || null != r["@@iterator"]) return Array.from(r); }
function _arrayWithoutHoles(r) { if (Array.isArray(r)) return _arrayLikeToArray(r); }
function _regenerator() { /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */ var e, t, r = "function" == typeof Symbol ? Symbol : {}, n = r.iterator || "@@iterator", o = r.toStringTag || "@@toStringTag"; function i(r, n, o, i) { var c = n && n.prototype instanceof Generator ? n : Generator, u = Object.create(c.prototype); return _regeneratorDefine2(u, "_invoke", function (r, n, o) { var i, c, u, f = 0, p = o || [], y = !1, G = { p: 0, n: 0, v: e, a: d, f: d.bind(e, 4), d: function d(t, r) { return i = t, c = 0, u = e, G.n = r, a; } }; function d(r, n) { for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) { var o, i = p[t], d = G.p, l = i[2]; r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0)); } if (o || r > 1) return a; throw y = !0, n; } return function (o, p, l) { if (f > 1) throw TypeError("Generator is already running"); for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) { i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u); try { if (f = 2, i) { if (c || (o = "next"), t = i[o]) { if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object"); if (!t.done) return t; u = t.value, c < 2 && (c = 0); } else 1 === c && (t = i["return"]) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1); i = e; } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break; } catch (t) { i = e, c = 1, u = t; } finally { f = 1; } } return { value: t, done: y }; }; }(r, o, i), !0), u; } var a = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} t = Object.getPrototypeOf; var c = [][n] ? t(t([][n]())) : (_regeneratorDefine2(t = {}, n, function () { return this; }), t), u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c); function f(e) { return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, _regeneratorDefine2(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, _regeneratorDefine2(u, "constructor", GeneratorFunctionPrototype), _regeneratorDefine2(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", _regeneratorDefine2(GeneratorFunctionPrototype, o, "GeneratorFunction"), _regeneratorDefine2(u), _regeneratorDefine2(u, o, "Generator"), _regeneratorDefine2(u, n, function () { return this; }), _regeneratorDefine2(u, "toString", function () { return "[object Generator]"; }), (_regenerator = function _regenerator() { return { w: i, m: f }; })(); }
function _regeneratorDefine2(e, r, n, t) { var i = Object.defineProperty; try { i({}, "", {}); } catch (e) { i = 0; } _regeneratorDefine2 = function _regeneratorDefine(e, r, n, t) { function o(r, n) { _regeneratorDefine2(e, r, function (e) { return this._invoke(r, n, e); }); } r ? i ? i(e, r, { value: n, enumerable: !t, configurable: !t, writable: !t }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2)); }, _regeneratorDefine2(e, r, n, t); }
function asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
function _slicedToArray(r, e) { return _arrayWithHoles(r) || _iterableToArrayLimit(r, e) || _unsupportedIterableToArray(r, e) || _nonIterableRest(); }
function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _unsupportedIterableToArray(r, a) { if (r) { if ("string" == typeof r) return _arrayLikeToArray(r, a); var t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0; } }
function _arrayLikeToArray(r, a) { (null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n; }
function _iterableToArrayLimit(r, l) { var t = null == r ? null : "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (null != t) { var e, n, i, u, a = [], f = !0, o = !1; try { if (i = (t = t.call(r)).next, 0 === l) { if (Object(t) !== t) return; f = !1; } else for (; !(f = (e = i.call(t)).done) && (a.push(e.value), a.length !== l); f = !0); } catch (r) { o = !0, n = r; } finally { try { if (!f && null != t["return"] && (u = t["return"](), Object(u) !== u)) return; } finally { if (o) throw n; } } return a; } }
function _arrayWithHoles(r) { if (Array.isArray(r)) return r; }
var _React = React,
  useState = _React.useState,
  useEffect = _React.useEffect;

// Icons as SVG components
var SearchIcon = function SearchIcon() {
  return /*#__PURE__*/React.createElement("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "20",
    height: "20",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "11",
    r: "8"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m21 21-4.35-4.35"
  }));
};
var EditIcon = function EditIcon() {
  return /*#__PURE__*/React.createElement("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m15 5 4 4"
  }));
};
var TrashIcon = function TrashIcon() {
  return /*#__PURE__*/React.createElement("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 6h18"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"
  }));
};
var LogoutIcon = function LogoutIcon() {
  return /*#__PURE__*/React.createElement("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
  }), /*#__PURE__*/React.createElement("polyline", {
    points: "16 17 21 12 16 7"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "21",
    x2: "9",
    y1: "12",
    y2: "12"
  }));
};
var UserIcon = function UserIcon() {
  return /*#__PURE__*/React.createElement("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "7",
    r: "4"
  }));
};
var PlusIcon = function PlusIcon() {
  return /*#__PURE__*/React.createElement("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M5 12h14"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 5v14"
  }));
};
var FileTextIcon = function FileTextIcon() {
  return /*#__PURE__*/React.createElement("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "48",
    height: "48",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"
  }), /*#__PURE__*/React.createElement("polyline", {
    points: "14 2 14 8 20 8"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "16",
    x2: "8",
    y1: "13",
    y2: "13"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "16",
    x2: "8",
    y1: "17",
    y2: "17"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "10",
    x2: "8",
    y1: "9",
    y2: "9"
  }));
};
var CheckIcon = function CheckIcon() {
  return /*#__PURE__*/React.createElement("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("polyline", {
    points: "20 6 9 17 4 12"
  }));
};
var XIcon = function XIcon() {
  return /*#__PURE__*/React.createElement("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M18 6 6 18"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m6 6 12 12"
  }));
};
var AlertTriangleIcon = function AlertTriangleIcon() {
  return /*#__PURE__*/React.createElement("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "20",
    height: "20",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 9v4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 17h.01"
  }));
};

// Toast component
function Toast(_ref) {
  var message = _ref.message,
    type = _ref.type,
    onClose = _ref.onClose;
  useEffect(function () {
    var timer = setTimeout(onClose, 3000);
    return function () {
      return clearTimeout(timer);
    };
  }, [onClose]);
  return /*#__PURE__*/React.createElement("div", {
    className: "fixed bottom-6 right-6 z-[60] px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 toast-enter ".concat(type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white')
  }, type === 'success' ? /*#__PURE__*/React.createElement(CheckIcon, null) : /*#__PURE__*/React.createElement(AlertTriangleIcon, null), /*#__PURE__*/React.createElement("span", {
    className: "font-medium text-sm"
  }, message));
}

// Main App Component
function App() {
  var _useState = useState([]),
    _useState2 = _slicedToArray(_useState, 2),
    quotations = _useState2[0],
    setQuotations = _useState2[1];
  var _useState3 = useState(true),
    _useState4 = _slicedToArray(_useState3, 2),
    loading = _useState4[0],
    setLoading = _useState4[1];
  var _useState5 = useState(''),
    _useState6 = _slicedToArray(_useState5, 2),
    searchTerm = _useState6[0],
    setSearchTerm = _useState6[1];
  var _useState7 = useState(1),
    _useState8 = _slicedToArray(_useState7, 2),
    currentPage = _useState8[0],
    setCurrentPage = _useState8[1];
  var _useState9 = useState(10),
    _useState0 = _slicedToArray(_useState9, 1),
    itemsPerPage = _useState0[0];
  var _useState1 = useState(null),
    _useState10 = _slicedToArray(_useState1, 2),
    editingQuotation = _useState10[0],
    setEditingQuotation = _useState10[1];
  var _useState11 = useState({
      cotacao: '',
      anotacao: ''
    }),
    _useState12 = _slicedToArray(_useState11, 2),
    formData = _useState12[0],
    setFormData = _useState12[1];
  var _useState13 = useState(false),
    _useState14 = _slicedToArray(_useState13, 2),
    showModal = _useState14[0],
    setShowModal = _useState14[1];
  var _useState15 = useState(null),
    _useState16 = _slicedToArray(_useState15, 2),
    deleteModal = _useState16[0],
    setDeleteModal = _useState16[1];
  var _useState17 = useState(null),
    _useState18 = _slicedToArray(_useState17, 2),
    statusModal = _useState18[0],
    setStatusModal = _useState18[1];
  var _useState19 = useState(''),
    _useState20 = _slicedToArray(_useState19, 2),
    username = _useState20[0],
    setUsername = _useState20[1];
  var _useState21 = useState(null),
    _useState22 = _slicedToArray(_useState21, 2),
    toast = _useState22[0],
    setToast = _useState22[1];
  useEffect(function () {
    var BASE_PATH = window.location.pathname.startsWith('/pme_notas') ? '/pme_notas' : '';
    var token = localStorage.getItem('token');
    if (!token) {
      window.location.href = BASE_PATH + '/login.html';
      return;
    }
    var storedUsername = localStorage.getItem('username');
    if (storedUsername) {
      setUsername(storedUsername);
    }
    fetchQuotations();
    var handlePopState = function handlePopState(event) {
      var BASE_PATH = window.location.pathname.startsWith('/pme_notas') ? '/pme_notas' : '';
      var currentToken = localStorage.getItem('token');
      if (!currentToken) {
        window.location.href = BASE_PATH + '/login.html';
      } else {
        window.history.pushState(null, '', window.location.href);
      }
    };
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', handlePopState);
    return function () {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);
  useEffect(function () {
    setCurrentPage(1);
  }, [searchTerm]);
  var showToast = function showToast(message) {
    var type = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'success';
    setToast({
      message: message,
      type: type
    });
  };
  var fetchQuotations = /*#__PURE__*/function () {
    var _ref2 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee() {
      var token, params, BASE_PATH, response, data, _t;
      return _regenerator().w(function (_context) {
        while (1) switch (_context.p = _context.n) {
          case 0:
            _context.p = 0;
            setLoading(true);
            token = localStorage.getItem('token');
            params = new URLSearchParams();
            if (searchTerm) params.append('search', searchTerm);
            BASE_PATH = window.location.pathname.startsWith('/pme_notas') ? '/pme_notas' : '';
            _context.n = 1;
            return fetch("".concat(BASE_PATH, "/api/quotations?").concat(params), {
              headers: {
                'Authorization': "Bearer ".concat(token)
              }
            });
          case 1:
            response = _context.v;
            if (!(response.status === 401 || response.status === 403)) {
              _context.n = 2;
              break;
            }
            localStorage.removeItem('token');
            localStorage.removeItem('username');
            window.location.href = BASE_PATH + '/login.html';
            return _context.a(2);
          case 2:
            _context.n = 3;
            return response.json();
          case 3:
            data = _context.v;
            setQuotations(data);
            _context.n = 5;
            break;
          case 4:
            _context.p = 4;
            _t = _context.v;
            console.error('Erro ao buscar cotações:', _t);
            showToast('Erro ao carregar cotações', 'error');
          case 5:
            _context.p = 5;
            setLoading(false);
            return _context.f(5);
          case 6:
            return _context.a(2);
        }
      }, _callee, null, [[0, 4, 5, 6]]);
    }));
    return function fetchQuotations() {
      return _ref2.apply(this, arguments);
    };
  }();
  useEffect(function () {
    var timer = setTimeout(function () {
      fetchQuotations();
    }, 300);
    return function () {
      return clearTimeout(timer);
    };
  }, [searchTerm]);
  var handleLogout = function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    var BASE_PATH = window.location.pathname.startsWith('/pme_notas') ? '/pme_notas' : '';
    window.location.href = BASE_PATH + '/login.html';
  };
  var handleFormSubmit = /*#__PURE__*/function () {
    var _ref3 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee2(e) {
      var token, BASE_PATH, response, _BASE_PATH, _response, _t2;
      return _regenerator().w(function (_context2) {
        while (1) switch (_context2.p = _context2.n) {
          case 0:
            e.preventDefault();
            token = localStorage.getItem('token');
            _context2.p = 1;
            if (!editingQuotation) {
              _context2.n = 4;
              break;
            }
            BASE_PATH = window.location.pathname.startsWith('/pme_notas') ? '/pme_notas' : '';
            _context2.n = 2;
            return fetch("".concat(BASE_PATH, "/api/quotations/").concat(editingQuotation.cotacao), {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': "Bearer ".concat(token)
              },
              body: JSON.stringify({
                anotacao: formData.anotacao,
                status: editingQuotation.status
              })
            });
          case 2:
            response = _context2.v;
            if (!(response.status === 401 || response.status === 403)) {
              _context2.n = 3;
              break;
            }
            localStorage.removeItem('token');
            localStorage.removeItem('username');
            window.location.href = BASE_PATH + '/login.html';
            return _context2.a(2);
          case 3:
            if (response.ok) {
              fetchQuotations();
              setShowModal(false);
              setEditingQuotation(null);
              setFormData({
                cotacao: '',
                anotacao: ''
              });
              showToast('Cotação atualizada com sucesso');
            }
            _context2.n = 7;
            break;
          case 4:
            _BASE_PATH = window.location.pathname.startsWith('/pme_notas') ? '/pme_notas' : '';
            _context2.n = 5;
            return fetch("".concat(_BASE_PATH, "/api/quotations"), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': "Bearer ".concat(token)
              },
              body: JSON.stringify(formData)
            });
          case 5:
            _response = _context2.v;
            if (!(_response.status === 401 || _response.status === 403)) {
              _context2.n = 6;
              break;
            }
            localStorage.removeItem('token');
            localStorage.removeItem('username');
            window.location.href = _BASE_PATH + '/login.html';
            return _context2.a(2);
          case 6:
            if (_response.ok) {
              fetchQuotations();
              setShowModal(false);
              setFormData({
                cotacao: '',
                anotacao: ''
              });
              showToast('Cotação criada com sucesso');
            }
          case 7:
            _context2.n = 9;
            break;
          case 8:
            _context2.p = 8;
            _t2 = _context2.v;
            console.error('Erro ao salvar cotação:', _t2);
            showToast('Erro ao salvar cotação', 'error');
          case 9:
            return _context2.a(2);
        }
      }, _callee2, null, [[1, 8]]);
    }));
    return function handleFormSubmit(_x) {
      return _ref3.apply(this, arguments);
    };
  }();
  var handleEditClick = function handleEditClick(quotation) {
    setEditingQuotation(quotation);
    setFormData({
      cotacao: quotation.cotacao,
      anotacao: quotation.anotacao
    });
    setShowModal(true);
  };
  var handleDeleteClick = function handleDeleteClick(quotation) {
    setDeleteModal(quotation);
  };
  var confirmDelete = /*#__PURE__*/function () {
    var _ref4 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee3() {
      var token, BASE_PATH, response, _t3;
      return _regenerator().w(function (_context3) {
        while (1) switch (_context3.p = _context3.n) {
          case 0:
            if (deleteModal) {
              _context3.n = 1;
              break;
            }
            return _context3.a(2);
          case 1:
            token = localStorage.getItem('token');
            _context3.p = 2;
            BASE_PATH = window.location.pathname.startsWith('/pme_notas') ? '/pme_notas' : '';
            _context3.n = 3;
            return fetch("".concat(BASE_PATH, "/api/quotations/").concat(deleteModal.cotacao), {
              method: 'DELETE',
              headers: {
                'Authorization': "Bearer ".concat(token)
              }
            });
          case 3:
            response = _context3.v;
            if (!(response.status === 401 || response.status === 403)) {
              _context3.n = 4;
              break;
            }
            localStorage.removeItem('token');
            localStorage.removeItem('username');
            window.location.href = BASE_PATH + '/login.html';
            return _context3.a(2);
          case 4:
            if (response.ok) {
              fetchQuotations();
              setDeleteModal(null);
              showToast('Cotação excluída com sucesso');
            }
            _context3.n = 6;
            break;
          case 5:
            _context3.p = 5;
            _t3 = _context3.v;
            console.error('Erro ao deletar cotação:', _t3);
            showToast('Erro ao excluir cotação', 'error');
          case 6:
            return _context3.a(2);
        }
      }, _callee3, null, [[2, 5]]);
    }));
    return function confirmDelete() {
      return _ref4.apply(this, arguments);
    };
  }();
  var cancelDelete = function cancelDelete() {
    setDeleteModal(null);
  };
  var handleStatusClick = function handleStatusClick(quotation) {
    setStatusModal(quotation);
  };
  var handleStatusChange = /*#__PURE__*/function () {
    var _ref5 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee4(newStatus) {
      var token, BASE_PATH, response, _BASE_PATH2, _t4;
      return _regenerator().w(function (_context4) {
        while (1) switch (_context4.p = _context4.n) {
          case 0:
            if (statusModal) {
              _context4.n = 1;
              break;
            }
            return _context4.a(2);
          case 1:
            token = localStorage.getItem('token');
            _context4.p = 2;
            BASE_PATH = window.location.pathname.startsWith('/pme_notas') ? '/pme_notas' : '';
            _context4.n = 3;
            return fetch("".concat(BASE_PATH, "/api/quotations/").concat(statusModal.cotacao), {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': "Bearer ".concat(token)
              },
              body: JSON.stringify({
                status: newStatus
              })
            });
          case 3:
            response = _context4.v;
            if (!(response.status === 401 || response.status === 403)) {
              _context4.n = 4;
              break;
            }
            localStorage.removeItem('token');
            localStorage.removeItem('username');
            _BASE_PATH2 = window.location.pathname.startsWith('/pme_notas') ? '/pme_notas' : '';
            window.location.href = _BASE_PATH2 + '/login.html';
            return _context4.a(2);
          case 4:
            if (response.ok) {
              fetchQuotations();
              setStatusModal(null);
              showToast('Status atualizado com sucesso');
            }
            _context4.n = 6;
            break;
          case 5:
            _context4.p = 5;
            _t4 = _context4.v;
            console.error('Erro ao atualizar status:', _t4);
            showToast('Erro ao atualizar status', 'error');
          case 6:
            return _context4.a(2);
        }
      }, _callee4, null, [[2, 5]]);
    }));
    return function handleStatusChange(_x2) {
      return _ref5.apply(this, arguments);
    };
  }();
  var filteredQuotations = quotations.filter(function (q) {
    return q.cotacao.toLowerCase().includes(searchTerm.toLowerCase()) || q.anotacao && q.anotacao.toLowerCase().includes(searchTerm.toLowerCase()) || q.status && q.status.toLowerCase().includes(searchTerm.toLowerCase());
  });
  var indexOfLastItem = currentPage * itemsPerPage;
  var indexOfFirstItem = indexOfLastItem - itemsPerPage;
  var currentQuotations = filteredQuotations.slice(indexOfFirstItem, indexOfLastItem);
  var totalPages = Math.ceil(filteredQuotations.length / itemsPerPage);
  var getStatusConfig = function getStatusConfig(status) {
    switch (status) {
      case 'aprovado':
        return {
          label: 'Aprovado',
          className: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
          dotClass: 'bg-emerald-500'
        };
      case 'reprovado':
        return {
          label: 'Reprovado',
          className: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
          dotClass: 'bg-red-500'
        };
      default:
        return {
          label: 'Pendente',
          className: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
          dotClass: 'bg-amber-500'
        };
    }
  };
  var formatDate = function formatDate(dateString) {
    if (!dateString || dateString === '-') return '-';
    try {
      var date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (_unused) {
      return dateString;
    }
  };
  var SkeletonRow = function SkeletonRow() {
    return /*#__PURE__*/React.createElement("tr", {
      className: "animate-pulse"
    }, /*#__PURE__*/React.createElement("td", {
      className: "px-6 py-4"
    }, /*#__PURE__*/React.createElement("div", {
      className: "h-4 bg-slate-200 rounded w-24"
    })), /*#__PURE__*/React.createElement("td", {
      className: "px-6 py-4"
    }, /*#__PURE__*/React.createElement("div", {
      className: "h-4 bg-slate-200 rounded w-full max-w-xs"
    })), /*#__PURE__*/React.createElement("td", {
      className: "px-6 py-4"
    }, /*#__PURE__*/React.createElement("div", {
      className: "h-4 bg-slate-200 rounded w-28"
    })), /*#__PURE__*/React.createElement("td", {
      className: "px-6 py-4"
    }, /*#__PURE__*/React.createElement("div", {
      className: "h-4 bg-slate-200 rounded w-28"
    })), /*#__PURE__*/React.createElement("td", {
      className: "px-6 py-4"
    }, /*#__PURE__*/React.createElement("div", {
      className: "h-6 bg-slate-200 rounded-full w-20"
    })), /*#__PURE__*/React.createElement("td", {
      className: "px-6 py-4"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex gap-2"
    }, /*#__PURE__*/React.createElement("div", {
      className: "h-8 w-8 bg-slate-200 rounded-lg"
    }), /*#__PURE__*/React.createElement("div", {
      className: "h-8 w-8 bg-slate-200 rounded-lg"
    }))));
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "min-h-screen bg-slate-50/80"
  }, /*#__PURE__*/React.createElement("header", {
    className: "bg-white border-b border-slate-200 shadow-sm sticky top-0 z-30"
  }, /*#__PURE__*/React.createElement("div", {
    className: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-center h-16"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center shadow-md"
  }, /*#__PURE__*/React.createElement("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    className: "h-5 w-5 text-white",
    fill: "none",
    viewBox: "0 0 24 24",
    stroke: "currentColor",
    strokeWidth: 2
  }, /*#__PURE__*/React.createElement("path", {
    strokeLinecap: "round",
    strokeLinejoin: "round",
    d: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
  }))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    className: "text-xl font-bold text-slate-800"
  }, "Cota\xE7\xF5es"), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-slate-500"
  }, "Gerenciamento de cota\xE7\xF5es"))), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "hidden sm:flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-full shadow-sm"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-7 h-7 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center text-white shadow-sm"
  }, /*#__PURE__*/React.createElement(UserIcon, null)), /*#__PURE__*/React.createElement("span", {
    className: "text-sm font-semibold text-white"
  }, username)), /*#__PURE__*/React.createElement("button", {
    onClick: handleLogout,
    className: "flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors duration-200"
  }, /*#__PURE__*/React.createElement(LogoutIcon, null), /*#__PURE__*/React.createElement("span", {
    className: "hidden sm:inline"
  }, "Sair")))))), /*#__PURE__*/React.createElement("main", {
    className: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"
  }, /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white rounded-xl p-4 border border-slate-200 shadow-sm"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-sm font-medium text-slate-500"
  }, "Total"), /*#__PURE__*/React.createElement("p", {
    className: "text-2xl font-bold text-slate-800 mt-1"
  }, filteredQuotations.length)), /*#__PURE__*/React.createElement("div", {
    className: "bg-white rounded-xl p-4 border border-slate-200 shadow-sm"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-sm font-medium text-emerald-600"
  }, "Aprovadas"), /*#__PURE__*/React.createElement("p", {
    className: "text-2xl font-bold text-emerald-700 mt-1"
  }, filteredQuotations.filter(function (q) {
    return q.status === 'aprovado';
  }).length)), /*#__PURE__*/React.createElement("div", {
    className: "bg-white rounded-xl p-4 border border-slate-200 shadow-sm"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-sm font-medium text-amber-600"
  }, "Pendentes"), /*#__PURE__*/React.createElement("p", {
    className: "text-2xl font-bold text-amber-700 mt-1"
  }, filteredQuotations.filter(function (q) {
    return !q.status || q.status === 'pendente';
  }).length)), /*#__PURE__*/React.createElement("div", {
    className: "bg-white rounded-xl p-4 border border-slate-200 shadow-sm"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-sm font-medium text-red-600"
  }, "Reprovadas"), /*#__PURE__*/React.createElement("p", {
    className: "text-2xl font-bold text-red-700 mt-1"
  }, filteredQuotations.filter(function (q) {
    return q.status === 'reprovado';
  }).length))), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col sm:flex-row gap-4 mb-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex-1 relative group"
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"
  }, /*#__PURE__*/React.createElement(SearchIcon, null)), /*#__PURE__*/React.createElement("input", {
    type: "text",
    placeholder: "Buscar por cota\xE7\xE3o, anota\xE7\xE3o ou status...",
    value: searchTerm,
    onChange: function onChange(e) {
      return setSearchTerm(e.target.value);
    },
    className: "w-full pl-11 pr-4 py-3 bg-white border-2 border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:ring-2 focus:ring-red-500/20 focus:border-red-500 focus:shadow-lg shadow-sm transition-all duration-200 group-hover:border-slate-300"
  }), /*#__PURE__*/React.createElement("div", {
    className: "absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-2 h-2 rounded-full bg-slate-300 group-hover:bg-red-500 transition-colors duration-200"
  }))), /*#__PURE__*/React.createElement("button", {
    onClick: function onClick() {
      setEditingQuotation(null);
      setFormData({
        cotacao: '',
        anotacao: ''
      });
      setShowModal(true);
    },
    className: "inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold rounded-xl hover:from-blue-700 hover:to-indigo-700 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200 shadow-md hover:shadow-lg"
  }, /*#__PURE__*/React.createElement(PlusIcon, null), "Nova cota\xE7\xE3o")), /*#__PURE__*/React.createElement("div", {
    className: "bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
  }, loading ? /*#__PURE__*/React.createElement("div", {
    className: "overflow-x-auto"
  }, /*#__PURE__*/React.createElement("table", {
    className: "min-w-full divide-y divide-slate-200"
  }, /*#__PURE__*/React.createElement("thead", {
    className: "bg-slate-50"
  }, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    className: "px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider"
  }, "Cota\xE7\xE3o"), /*#__PURE__*/React.createElement("th", {
    className: "px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider"
  }, "Anota\xE7\xE3o"), /*#__PURE__*/React.createElement("th", {
    className: "px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider"
  }, "Cria\xE7\xE3o"), /*#__PURE__*/React.createElement("th", {
    className: "px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider"
  }, "Atualiza\xE7\xE3o"), /*#__PURE__*/React.createElement("th", {
    className: "px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider"
  }, "Status"), /*#__PURE__*/React.createElement("th", {
    className: "px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider"
  }, "A\xE7\xF5es"))), /*#__PURE__*/React.createElement("tbody", {
    className: "bg-white divide-y divide-slate-100"
  }, _toConsumableArray(Array(5)).map(function (_, i) {
    return /*#__PURE__*/React.createElement(SkeletonRow, {
      key: i
    });
  })))) : filteredQuotations.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "p-12 text-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-2xl text-slate-400 mb-4"
  }, /*#__PURE__*/React.createElement(FileTextIcon, null)), /*#__PURE__*/React.createElement("h3", {
    className: "text-lg font-semibold text-slate-800 mb-1"
  }, "Nenhuma cota\xE7\xE3o encontrada"), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-500 text-sm"
  }, "Tente ajustar sua busca ou adicione uma nova cota\xE7\xE3o.")) : /*#__PURE__*/React.createElement("div", {
    className: "overflow-x-auto"
  }, /*#__PURE__*/React.createElement("table", {
    className: "min-w-full divide-y divide-slate-200"
  }, /*#__PURE__*/React.createElement("thead", {
    className: "bg-slate-50"
  }, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    className: "px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider"
  }, "Cota\xE7\xE3o"), /*#__PURE__*/React.createElement("th", {
    className: "px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider"
  }, "Anota\xE7\xE3o"), /*#__PURE__*/React.createElement("th", {
    className: "px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider"
  }, "Cria\xE7\xE3o"), /*#__PURE__*/React.createElement("th", {
    className: "px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider"
  }, "Atualiza\xE7\xE3o"), /*#__PURE__*/React.createElement("th", {
    className: "px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider"
  }, "Status"), /*#__PURE__*/React.createElement("th", {
    className: "px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider"
  }, "A\xE7\xF5es"))), /*#__PURE__*/React.createElement("tbody", {
    className: "bg-white divide-y divide-slate-100"
  }, currentQuotations.map(function (quotation) {
    var statusConfig = getStatusConfig(quotation.status);
    return /*#__PURE__*/React.createElement("tr", {
      key: quotation.cotacao,
      className: "hover:bg-slate-50/80 transition-colors duration-150"
    }, /*#__PURE__*/React.createElement("td", {
      className: "px-6 py-4 whitespace-nowrap"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-sm font-semibold text-slate-900 font-mono bg-slate-100 px-2 py-1 rounded-md"
    }, quotation.cotacao)), /*#__PURE__*/React.createElement("td", {
      className: "px-6 py-4"
    }, /*#__PURE__*/React.createElement("p", {
      className: "text-sm text-slate-600 max-w-md truncate",
      title: quotation.anotacao
    }, quotation.anotacao || '-')), /*#__PURE__*/React.createElement("td", {
      className: "px-6 py-4 whitespace-nowrap text-sm text-slate-500"
    }, formatDate(quotation.createdAt)), /*#__PURE__*/React.createElement("td", {
      className: "px-6 py-4 whitespace-nowrap text-sm text-slate-500"
    }, formatDate(quotation.updatedAt)), /*#__PURE__*/React.createElement("td", {
      className: "px-6 py-4 whitespace-nowrap"
    }, /*#__PURE__*/React.createElement("button", {
      onClick: function onClick() {
        return handleStatusClick(quotation);
      },
      className: "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border transition-all duration-200 hover:shadow-sm ".concat(statusConfig.className)
    }, /*#__PURE__*/React.createElement("span", {
      className: "w-1.5 h-1.5 rounded-full ".concat(statusConfig.dotClass)
    }), statusConfig.label)), /*#__PURE__*/React.createElement("td", {
      className: "px-6 py-4 whitespace-nowrap"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-1"
    }, /*#__PURE__*/React.createElement("button", {
      onClick: function onClick() {
        return handleEditClick(quotation);
      },
      className: "group p-2 text-blue-600 bg-blue-50 hover:bg-blue-600 hover:text-white rounded-lg transition-all duration-200 hover:scale-110 hover:shadow-md",
      title: "Editar"
    }, /*#__PURE__*/React.createElement(EditIcon, null)), /*#__PURE__*/React.createElement("button", {
      onClick: function onClick() {
        return handleDeleteClick(quotation);
      },
      className: "group p-2 text-red-600 bg-red-50 hover:bg-red-600 hover:text-white rounded-lg transition-all duration-200 hover:scale-110 hover:shadow-md",
      title: "Excluir"
    }, /*#__PURE__*/React.createElement(TrashIcon, null)))));
  }))))), totalPages > 1 && /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between mt-6 bg-white px-4 py-3 rounded-xl border border-slate-200 shadow-sm"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-slate-500 hidden sm:block"
  }, "Mostrando ", /*#__PURE__*/React.createElement("span", {
    className: "font-medium"
  }, indexOfFirstItem + 1), " a ", /*#__PURE__*/React.createElement("span", {
    className: "font-medium"
  }, Math.min(indexOfLastItem, filteredQuotations.length)), " de ", /*#__PURE__*/React.createElement("span", {
    className: "font-medium"
  }, filteredQuotations.length), " resultados"), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 mx-auto sm:mx-0"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: function onClick() {
      return setCurrentPage(function (p) {
        return Math.max(1, p - 1);
      });
    },
    disabled: currentPage === 1,
    className: "px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
  }, "Anterior"), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-1"
  }, _toConsumableArray(Array(totalPages)).map(function (_, i) {
    var page = i + 1;
    return /*#__PURE__*/React.createElement("button", {
      key: page,
      onClick: function onClick() {
        return setCurrentPage(page);
      },
      className: "w-9 h-9 text-sm font-medium rounded-lg transition-colors duration-200 ".concat(currentPage === page ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100')
    }, page);
  })), /*#__PURE__*/React.createElement("button", {
    onClick: function onClick() {
      return setCurrentPage(function (p) {
        return Math.min(totalPages, p + 1);
      });
    },
    disabled: currentPage === totalPages,
    className: "px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
  }, "Pr\xF3xima")))), showModal && /*#__PURE__*/React.createElement("div", {
    className: "fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 modal-overlay p-4",
    onClick: function onClick(e) {
      if (e.target === e.currentTarget) {
        setShowModal(false);
        setEditingQuotation(null);
        setFormData({
          cotacao: '',
          anotacao: ''
        });
      }
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl modal-content"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between mb-5"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "text-lg font-bold text-slate-800"
  }, editingQuotation ? 'Editar cotação' : 'Nova cotação'), /*#__PURE__*/React.createElement("button", {
    onClick: function onClick() {
      setShowModal(false);
      setEditingQuotation(null);
      setFormData({
        cotacao: '',
        anotacao: ''
      });
    },
    className: "p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors duration-200"
  }, /*#__PURE__*/React.createElement(XIcon, null))), /*#__PURE__*/React.createElement("form", {
    onSubmit: handleFormSubmit,
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "block text-sm font-medium text-slate-700 mb-1.5"
  }, "Cota\xE7\xE3o"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    value: formData.cotacao,
    onChange: function onChange(e) {
      return setFormData(_objectSpread(_objectSpread({}, formData), {}, {
        cotacao: e.target.value
      }));
    },
    className: "w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 disabled:bg-slate-100 disabled:text-slate-500",
    required: true,
    disabled: !!editingQuotation,
    placeholder: "Digite o n\xFAmero da cota\xE7\xE3o"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "block text-sm font-medium text-slate-700 mb-1.5"
  }, "Anota\xE7\xE3o"), /*#__PURE__*/React.createElement("textarea", {
    value: formData.anotacao,
    onChange: function onChange(e) {
      return setFormData(_objectSpread(_objectSpread({}, formData), {}, {
        anotacao: e.target.value
      }));
    },
    className: "w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 resize-none",
    rows: "3",
    placeholder: "Adicione uma observa\xE7\xE3o..."
  })), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 gap-4"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "block text-sm font-medium text-slate-700 mb-1.5"
  }, "Data Cria\xE7\xE3o"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    value: editingQuotation ? formatDate(editingQuotation.createdAt) : formatDate(new Date().toISOString()),
    disabled: true,
    className: "w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-sm text-slate-500"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "block text-sm font-medium text-slate-700 mb-1.5"
  }, "Data Atualiza\xE7\xE3o"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    value: editingQuotation ? formatDate(editingQuotation.updatedAt) : formatDate(new Date().toISOString()),
    disabled: true,
    className: "w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-sm text-slate-500"
  }))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "block text-sm font-medium text-slate-700 mb-1.5"
  }, "Status"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    value: editingQuotation ? editingQuotation.status || 'pendente' : 'pendente',
    disabled: true,
    className: "w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-sm text-slate-500 capitalize"
  })), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-3 pt-2"
  }, /*#__PURE__*/React.createElement("button", {
    type: "submit",
    className: "flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold rounded-xl hover:from-blue-700 hover:to-indigo-700 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200"
  }, "Salvar"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: function onClick() {
      setShowModal(false);
      setEditingQuotation(null);
      setFormData({
        cotacao: '',
        anotacao: ''
      });
    },
    className: "flex-1 px-4 py-2.5 bg-white text-slate-700 border border-slate-300 text-sm font-semibold rounded-xl hover:bg-slate-50 focus:ring-4 focus:ring-slate-500/10 transition-all duration-200"
  }, "Cancelar"))))), deleteModal && /*#__PURE__*/React.createElement("div", {
    className: "fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 modal-overlay p-4",
    onClick: function onClick(e) {
      if (e.target === e.currentTarget) setDeleteModal(null);
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl modal-content"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3 mb-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-10 h-10 bg-red-100 rounded-full flex items-center justify-center text-red-600"
  }, /*#__PURE__*/React.createElement(AlertTriangleIcon, null)), /*#__PURE__*/React.createElement("h2", {
    className: "text-lg font-bold text-slate-800"
  }, "Confirmar Exclus\xE3o")), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-600 text-sm mb-6"
  }, "Tem certeza que deseja excluir a cota\xE7\xE3o ", /*#__PURE__*/React.createElement("span", {
    className: "font-semibold text-slate-800 font-mono"
  }, deleteModal.cotacao), "? Esta a\xE7\xE3o n\xE3o poder\xE1 ser desfeita."), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-3"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: confirmDelete,
    className: "flex-1 px-4 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 focus:ring-4 focus:ring-red-500/20 transition-all duration-200"
  }, "Excluir"), /*#__PURE__*/React.createElement("button", {
    onClick: cancelDelete,
    className: "flex-1 px-4 py-2.5 bg-white text-slate-700 border border-slate-300 text-sm font-semibold rounded-xl hover:bg-slate-50 focus:ring-4 focus:ring-slate-500/10 transition-all duration-200"
  }, "Cancelar")))), statusModal && /*#__PURE__*/React.createElement("div", {
    className: "fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 modal-overlay p-4",
    onClick: function onClick(e) {
      if (e.target === e.currentTarget) setStatusModal(null);
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl modal-content"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "text-lg font-bold text-slate-800 mb-2"
  }, "Alterar Status"), /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-slate-500 mb-5"
  }, "Selecione o novo status para a cota\xE7\xE3o ", /*#__PURE__*/React.createElement("span", {
    className: "font-semibold text-slate-800 font-mono"
  }, statusModal.cotacao), "."), /*#__PURE__*/React.createElement("div", {
    className: "space-y-2.5"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: function onClick() {
      return handleStatusChange('pendente');
    },
    className: "w-full flex items-center gap-3 px-4 py-3 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl hover:bg-amber-100 transition-all duration-200 font-semibold text-sm"
  }, /*#__PURE__*/React.createElement("span", {
    className: "w-2.5 h-2.5 rounded-full bg-amber-500"
  }), "Pendente"), /*#__PURE__*/React.createElement("button", {
    onClick: function onClick() {
      return handleStatusChange('aprovado');
    },
    className: "w-full flex items-center gap-3 px-4 py-3 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-all duration-200 font-semibold text-sm"
  }, /*#__PURE__*/React.createElement("span", {
    className: "w-2.5 h-2.5 rounded-full bg-emerald-500"
  }), "Aprovado"), /*#__PURE__*/React.createElement("button", {
    onClick: function onClick() {
      return handleStatusChange('reprovado');
    },
    className: "w-full flex items-center gap-3 px-4 py-3 bg-red-50 text-red-700 border border-red-200 rounded-xl hover:bg-red-100 transition-all duration-200 font-semibold text-sm"
  }, /*#__PURE__*/React.createElement("span", {
    className: "w-2.5 h-2.5 rounded-full bg-red-500"
  }), "Reprovado")), /*#__PURE__*/React.createElement("button", {
    onClick: function onClick() {
      return setStatusModal(null);
    },
    className: "w-full mt-4 px-4 py-2.5 bg-white text-slate-700 border border-slate-300 rounded-xl hover:bg-slate-50 text-sm font-semibold transition-all duration-200"
  }, "Cancelar"))), toast && /*#__PURE__*/React.createElement(Toast, {
    message: toast.message,
    type: toast.type,
    onClose: function onClose() {
      return setToast(null);
    }
  }));
}

// Render
var root = ReactDOM.createRoot(document.getElementById('root'));
root.render(/*#__PURE__*/React.createElement(App, null));
