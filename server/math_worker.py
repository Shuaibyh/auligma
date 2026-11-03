"""Verificación restringida: AST aritmético, sin eval, exec, sympify ni parse_expr."""
import ast
import json
import sys
import sympy as s

X = s.Symbol('x', real=True)


def expression(text):
    if not isinstance(text, str) or len(text) > 500:
        raise ValueError('Expresión demasiado larga')
    tree = ast.parse(text.replace('^', '**'), mode='eval')
    if sum(1 for _ in ast.walk(tree)) > 100:
        raise ValueError('Expresión demasiado compleja')
    restrictions = []

    def complexity(node):
        if isinstance(node, (ast.Name, ast.Constant)):
            return 1
        if isinstance(node, ast.UnaryOp):
            return complexity(node.operand)
        if isinstance(node, ast.BinOp):
            left, right = complexity(node.left), complexity(node.right)
            if isinstance(node.op, ast.Pow):
                exponent = node.right
                if isinstance(exponent, ast.UnaryOp):
                    exponent = exponent.operand
                if not isinstance(exponent, ast.Constant) or type(exponent.value) is not int or abs(exponent.value) > 8:
                    raise ValueError('Exponente no permitido')
                cost = left * max(1, abs(exponent.value))
            else:
                cost = left + right
            if cost > 32:
                raise ValueError('Complejidad algebraica excesiva')
            return cost
        raise ValueError('Operación no permitida')

    complexity(tree.body)

    def build(node, depth=0):
        if depth > 15:
            raise ValueError('Expresión demasiado profunda')
        if isinstance(node, ast.Constant) and type(node.value) is int and abs(node.value) <= 10000:
            return s.Integer(node.value)
        if isinstance(node, ast.Name) and node.id == 'x':
            return X
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
            value = build(node.operand, depth + 1)
            return -value if isinstance(node.op, ast.USub) else value
        if isinstance(node, ast.BinOp):
            left, right = build(node.left, depth + 1), build(node.right, depth + 1)
            if isinstance(node.op, ast.Add):
                return left + right
            if isinstance(node.op, ast.Sub):
                return left - right
            if isinstance(node.op, ast.Mult):
                return left * right
            if isinstance(node.op, ast.Div):
                restrictions.append(right)
                if right == 0:
                    raise ValueError('División por cero')
                return left / right
            if isinstance(node.op, ast.Pow) and right.is_Integer and abs(right) <= 8:
                if left == 0 and right <= 0:
                    raise ValueError('Potencia indefinida')
                if right < 0:
                    restrictions.append(left)
                return left ** right
        raise ValueError('Solo x, enteros y operaciones + - * / ** con exponentes enteros hasta 8')

    value = build(tree.body)
    if value.has(s.zoo, s.nan, s.oo, -s.oo):
        raise ValueError('Expresión indefinida')
    return value, restrictions


def verify(data):
    original, restrictions = expression(data['expression'])
    operation = data.get('operation', 'equivalence')
    if operation not in ('derivative', 'equivalence'):
        raise ValueError('Operación no permitida')
    expected = s.diff(original, X) if operation == 'derivative' else original
    answers = data['alternatives']
    if not isinstance(answers, list) or not 1 <= len(answers) <= 8:
        raise ValueError('Se requieren entre una y ocho alternativas')
    results, parsed = [], []
    for answer in answers:
        value, excluded = expression(answer)
        parsed.append(value)
        # Solo funciones racionales: el dominio se conserva incluso si se cancela un factor.
        original_excluded = s.EmptySet
        for item in restrictions:
            original_excluded = s.Union(original_excluded, s.solveset(item, X, domain=s.S.Reals))
        answer_excluded = s.EmptySet
        for item in excluded:
            answer_excluded = s.Union(answer_excluded, s.solveset(item, X, domain=s.S.Reals))
        domain_covers = answer_excluded.is_subset(original_excluded)
        equal = s.cancel(expected - value) == 0
        status = 'CORRECTA' if equal and domain_covers is True else 'INDETERMINADO' if equal else 'INCORRECTA'
        results.append({'status': status, 'restrictions': [str(item) + ' != 0' for item in excluded]})
    duplicates = [[i, j] for i in range(len(parsed)) for j in range(i + 1, len(parsed)) if s.cancel(parsed[i] - parsed[j]) == 0]
    correct = [i for i, item in enumerate(results) if item['status'] == 'CORRECTA']
    valid = len(correct) == 1 and not duplicates and all(item['status'] != 'INDETERMINADO' for item in results)
    return {'status': 'VERIFICADO', 'expectedExpression': str(expected), 'alternatives': results, 'correctIndices': correct, 'duplicatePairs': duplicates,
            'singleChoiceValid': valid, 'publicationAllowed': False,
            'restrictions': [str(item) + ' != 0' for item in restrictions],
            'explanation': 'Hay respuestas equivalentes o ambiguas: modifica los distractores.' if not valid else 'Comprobación simbólica racional completada; falta aprobación docente.'}


if __name__ == '__main__':
    try:
        line = sys.stdin.buffer.read(8193)
        if len(line) > 8192:
            raise ValueError('Solicitud demasiado grande')
        print(json.dumps(verify(json.loads(line)), ensure_ascii=False))
    except Exception:
        print(json.dumps({'status': 'INDETERMINADO', 'singleChoiceValid': False, 'publicationAllowed': False,
                          'explanation': 'Expresión no admitida o verificación no concluyente.'}))
