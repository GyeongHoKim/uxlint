import {Text} from 'ink';

type Props = {
	readonly name?: string;
};

export default function App({name = 'Stranger'}: Props) {
	return (
		<Text>
			Hello, <Text color="green">{name}</Text>
		</Text>
	);
}
